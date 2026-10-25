import "server-only";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { generateRegistrationOptions, generateAuthenticationOptions, verifyRegistrationResponse, verifyAuthenticationResponse, type RegistrationResponseJSON, type AuthenticationResponseJSON, type AuthenticatorTransportFuture } from "@simplewebauthn/server";
import type { AuthenticatorPort } from "@/application/auth/auth.ports";
import { createToken, hashSecret } from "./auth-store";
const bytes = (value: Uint8Array) => new Uint8Array(new Uint8Array(value).buffer);
export const authenticator: AuthenticatorPort = {
  token: createToken,
  hash: hashSecret,
  equal: (a, b) => timingSafeEqual(Buffer.from(hashSecret(a), "hex"), Buffer.from(hashSecret(b), "hex")),
  recoveryCodes: () => Array.from({ length: 10 }, () => randomBytes(16).toString("hex")),
  async registrationOptions(config, userId, passkeys) {
    return { ...await generateRegistrationOptions({ rpName: "Kinesiología Clínica", rpID: config.rpID, userName: "profesional", userDisplayName: "Profesional", userID: bytes(userId), attestationType: "none", excludeCredentials: passkeys.map(p => ({ id: p.id, transports: p.transports as AuthenticatorTransportFuture[] })), authenticatorSelection: { residentKey: "required", userVerification: "required" } }) };
  },
  async loginOptions(config, passkeys) {
    return { ...await generateAuthenticationOptions({ rpID: config.rpID, allowCredentials: passkeys.map(p => ({ id: p.id, transports: p.transports as AuthenticatorTransportFuture[] })), userVerification: "required" }) };
  },
  async verifyRegistration(response, challenge, config) {
    const result = await verifyRegistrationResponse({ response: response as RegistrationResponseJSON, expectedChallenge: challenge, expectedOrigin: config.origin, expectedRPID: config.rpID, requireUserVerification: true });
    if (!result.verified || !result.registrationInfo) return null;
    const c = result.registrationInfo.credential;
    return { id: c.id, publicKey: c.publicKey, counter: c.counter, transports: c.transports ?? [] };
  },
  async verifyLogin(response, challenge, config, passkey) {
    const result = await verifyAuthenticationResponse({ response: response as AuthenticationResponseJSON, expectedChallenge: challenge, expectedOrigin: config.origin, expectedRPID: config.rpID, credential: { id: passkey.id, publicKey: bytes(passkey.publicKey), counter: passkey.counter, transports: passkey.transports as AuthenticatorTransportFuture[] }, requireUserVerification: true });
    return result.verified ? result.authenticationInfo.newCounter : null;
  },
};
