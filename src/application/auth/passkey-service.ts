import { randomBytes, timingSafeEqual } from "node:crypto";
import {
  generateAuthenticationOptions, generateRegistrationOptions,
  verifyAuthenticationResponse, verifyRegistrationResponse,
  type AuthenticationResponseJSON, type RegistrationResponseJSON,
} from "@simplewebauthn/server";
import type { AuthenticatorTransportFuture } from "@simplewebauthn/server";
import type { AuthConfig } from "@/infrastructure/auth/auth.config";
import { AuthStore, createToken, hashSecret } from "@/infrastructure/auth/auth-store";

const CHALLENGE_LIFETIME_MS = 5 * 60 * 1000;

function arrayBufferBacked(value: Uint8Array): Uint8Array<ArrayBuffer> {
  const copy = new Uint8Array(new ArrayBuffer(value.byteLength));
  copy.set(value);
  return copy;
}

function safeEqual(first: string, second: string) {
  const a = Buffer.from(hashSecret(first), "hex");
  const b = Buffer.from(hashSecret(second), "hex");
  return timingSafeEqual(a, b);
}

export function normalizeRecoveryCode(value: string): string | null {
  const normalized = value.toLowerCase().replace(/[\s-]/g, "");
  return /^[a-f0-9]{32}$/.test(normalized) ? normalized : null;
}

export async function beginRegistration(input: {
  store: AuthStore; config: AuthConfig; bootstrapToken?: string; sessionId?: string;
}) {
  const passkeys = input.store.listPasskeys();
  let actor: string;
  if (!passkeys.length) {
    if (!input.config.bootstrapToken || !input.bootstrapToken || !safeEqual(input.bootstrapToken, input.config.bootstrapToken)) {
      throw new Error("El código inicial no es válido.");
    }
    actor = "bootstrap";
  } else {
    if (!input.sessionId || !input.store.hasActiveSessionId(input.sessionId)) throw new Error("Acceso requerido.");
    actor = input.sessionId;
  }
  const options = await generateRegistrationOptions({
    rpName: "Kinesiología Clínica", rpID: input.config.rpID,
    userName: "profesional", userDisplayName: "Profesional",
    userID: arrayBufferBacked(input.store.getUserId()),
    attestationType: "none",
    excludeCredentials: passkeys.map((item) => ({ id: item.id, transports: item.transports as AuthenticatorTransportFuture[] })),
    authenticatorSelection: { residentKey: "required", userVerification: "required" },
  });
  const challengeToken = createToken();
  input.store.saveChallenge(challengeToken, { challenge: options.challenge, purpose: "registration", actor, recoveryHash: null, expiresAt: Date.now() + CHALLENGE_LIFETIME_MS });
  return { options, challengeToken };
}

export async function finishRegistration(input: {
  store: AuthStore; config: AuthConfig; challengeToken: string;
  response: RegistrationResponseJSON; label: string;
}) {
  const challenge = input.store.consumeChallenge(input.challengeToken, "registration");
  if (!challenge) throw new Error("La solicitud venció. Volvé a empezar.");
  if (challenge.actor === "bootstrap") {
    if (input.store.listPasskeys().length) throw new Error("La cuenta ya está provisionada.");
  } else if (!input.store.hasActiveSessionId(challenge.actor)) {
    throw new Error("Acceso requerido.");
  }
  const verification = await verifyRegistrationResponse({
    response: input.response, expectedChallenge: challenge.challenge,
    expectedOrigin: input.config.origin, expectedRPID: input.config.rpID,
    requireUserVerification: true,
  });
  if (!verification.verified || !verification.registrationInfo) throw new Error("La passkey no pudo verificarse.");
  const credential = verification.registrationInfo.credential;
  const label = input.label.trim().slice(0, 60) || "Dispositivo";
  const recoveryCodes = challenge.actor === "bootstrap" ? Array.from({ length: 10 }, () => randomBytes(16).toString("hex")) : [];
  const result = input.store.atomic(() => {
    input.store.savePasskey({ id: credential.id, publicKey: credential.publicKey, counter: credential.counter, transports: credential.transports ?? [], label });
    if (recoveryCodes.length) input.store.replaceRecoveryCodes(recoveryCodes);
    return input.store.createSession(credential.id, label);
  });
  return { ...result, recoveryCodes };
}

export async function beginLogin(store: AuthStore, config: AuthConfig) {
  const passkeys = store.listPasskeys();
  if (!passkeys.length) throw new Error("La cuenta todavía no está provisionada.");
  const options = await generateAuthenticationOptions({
    rpID: config.rpID,
    allowCredentials: passkeys.map((item) => ({ id: item.id, transports: item.transports as AuthenticatorTransportFuture[] })),
    userVerification: "required",
  });
  const challengeToken = createToken();
  store.saveChallenge(challengeToken, { challenge: options.challenge, purpose: "login", actor: "professional", recoveryHash: null, expiresAt: Date.now() + CHALLENGE_LIFETIME_MS });
  return { options, challengeToken };
}

export async function finishLogin(input: {
  store: AuthStore; config: AuthConfig; challengeToken: string; response: AuthenticationResponseJSON;
}) {
  const challenge = input.store.consumeChallenge(input.challengeToken, "login");
  if (!challenge) throw new Error("La solicitud venció. Volvé a empezar.");
  const passkey = input.store.getPasskey(input.response.id);
  if (!passkey) throw new Error("La passkey no está registrada.");
  const verification = await verifyAuthenticationResponse({
    response: input.response, expectedChallenge: challenge.challenge,
    expectedOrigin: input.config.origin, expectedRPID: input.config.rpID,
    credential: { id: passkey.id, publicKey: arrayBufferBacked(passkey.publicKey), counter: passkey.counter, transports: passkey.transports as AuthenticatorTransportFuture[] },
    requireUserVerification: true,
  });
  if (!verification.verified) throw new Error("La passkey no pudo verificarse.");
  return input.store.atomic(() => {
    input.store.updateCounter(passkey.id, verification.authenticationInfo.newCounter);
    return input.store.createSession(passkey.id, passkey.label);
  });
}

export async function beginRecovery(input: { store: AuthStore; config: AuthConfig; code: string }) {
  const normalized = normalizeRecoveryCode(input.code);
  if (!normalized || !input.store.hasRecoveryCode(normalized)) throw new Error("El código de recuperación no es válido.");
  const options = await generateRegistrationOptions({
    rpName: "Kinesiología Clínica", rpID: input.config.rpID,
    userName: "profesional", userDisplayName: "Profesional", userID: arrayBufferBacked(input.store.getUserId()),
    attestationType: "none",
    excludeCredentials: input.store.listPasskeys().map((item) => ({ id: item.id, transports: item.transports as AuthenticatorTransportFuture[] })),
    authenticatorSelection: { residentKey: "required", userVerification: "required" },
  });
  const challengeToken = createToken();
  input.store.saveChallenge(challengeToken, { challenge: options.challenge, purpose: "recovery", actor: "recovery", recoveryHash: hashSecret(normalized), expiresAt: Date.now() + CHALLENGE_LIFETIME_MS });
  return { options, challengeToken };
}

export async function finishRecovery(input: {
  store: AuthStore; config: AuthConfig; challengeToken: string; response: RegistrationResponseJSON; label: string;
}) {
  const challenge = input.store.consumeChallenge(input.challengeToken, "recovery");
  if (!challenge?.recoveryHash) throw new Error("La solicitud venció. Volvé a empezar.");
  const verification = await verifyRegistrationResponse({
    response: input.response, expectedChallenge: challenge.challenge,
    expectedOrigin: input.config.origin, expectedRPID: input.config.rpID,
    requireUserVerification: true,
  });
  if (!verification.verified || !verification.registrationInfo) throw new Error("La passkey no pudo verificarse.");
  const credential = verification.registrationInfo.credential;
  const label = input.label.trim().slice(0, 60) || "Dispositivo recuperado";
  const recoveryCodes = Array.from({ length: 10 }, () => randomBytes(16).toString("hex"));
  const result = input.store.atomic(() => {
    if (!input.store.useRecoveryCode(challenge.recoveryHash!)) throw new Error("El código ya se utilizó.");
    input.store.deleteAllPasskeys();
    input.store.savePasskey({ id: credential.id, publicKey: credential.publicKey, counter: credential.counter, transports: credential.transports ?? [], label });
    input.store.revokeAllSessions();
    input.store.replaceRecoveryCodes(recoveryCodes);
    return input.store.createSession(credential.id, label);
  });
  return { ...result, recoveryCodes };
}
