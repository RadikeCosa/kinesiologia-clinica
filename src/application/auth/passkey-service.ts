import type { AuthConfig, AuthStorePort, AuthenticatorPort, StoredChallenge } from "./auth.ports";
const CHALLENGE_LIFETIME_MS = 5 * 60 * 1000;
type Dependencies = { store: AuthStorePort; config: AuthConfig; authenticator: AuthenticatorPort };
function requireCurrent(store: AuthStorePort, challenge: StoredChallenge) {
  if (challenge.generation !== store.generation() || challenge.expiresAt <= Date.now()) throw new Error("La solicitud de acceso cambió o venció. Volvé a empezar.");
}
function requireActor(store: AuthStorePort, actor: string) {
  if (actor === "bootstrap") {
    if (store.listPasskeys().length) throw new Error("La cuenta ya está provisionada.");
  } else if (!store.hasActiveSessionId(actor)) throw new Error("Acceso requerido.");
}
export function normalizeRecoveryCode(value: string): string | null {
  const normalized = value.toLowerCase().replace(/[\s-]/g, "");
  return /^[a-f0-9]{32}$/.test(normalized) ? normalized : null;
}
export async function beginRegistration(input: Dependencies & { bootstrapToken?: string; sessionId?: string }) {
  const { store, config, authenticator } = input;
  const generation = store.generation(), passkeys = store.listPasskeys();
  let actor: string;
  if (!passkeys.length) {
    if (!config.bootstrapToken || !input.bootstrapToken || !authenticator.equal(input.bootstrapToken, config.bootstrapToken)) throw new Error("El código inicial no es válido.");
    actor = "bootstrap";
  } else {
    if (!input.sessionId || !store.hasActiveSessionId(input.sessionId)) throw new Error("Acceso requerido.");
    actor = input.sessionId;
  }
  const options = await authenticator.registrationOptions(config, store.getUserId(), passkeys);
  const challengeToken = authenticator.token();
  store.saveChallenge(challengeToken, { challenge: options.challenge, purpose: "registration", actor, recoveryHash: null, generation, expiresAt: Date.now() + CHALLENGE_LIFETIME_MS });
  return { options, challengeToken };
}
export async function finishRegistration(input: Dependencies & { challengeToken: string; response: unknown; label: string }) {
  const { store, config, authenticator } = input;
  const challenge = store.consumeChallenge(input.challengeToken, "registration");
  if (!challenge) throw new Error("La solicitud venció. Volvé a empezar.");
  requireCurrent(store, challenge); requireActor(store, challenge.actor);
  const credential = await authenticator.verifyRegistration(input.response, challenge.challenge, config);
  if (!credential) throw new Error("La passkey no pudo verificarse.");
  const label = input.label.trim().slice(0, 60) || "Dispositivo";
  const recoveryCodes = challenge.actor === "bootstrap" ? authenticator.recoveryCodes() : [];
  const result = store.atomic(() => {
    requireCurrent(store, challenge); requireActor(store, challenge.actor);
    store.savePasskey({ ...credential, label });
    if (recoveryCodes.length) store.replaceRecoveryCodes(recoveryCodes);
    return store.createSession(credential.id, label);
  });
  return { ...result, recoveryCodes };
}
export async function beginLogin(store: AuthStorePort, config: AuthConfig, authenticator: AuthenticatorPort) {
  const generation = store.generation(), passkeys = store.listPasskeys();
  if (!passkeys.length) throw new Error("La cuenta todavía no está provisionada.");
  const options = await authenticator.loginOptions(config, passkeys);
  const challengeToken = authenticator.token();
  store.saveChallenge(challengeToken, { challenge: options.challenge, purpose: "login", actor: "professional", recoveryHash: null, generation, expiresAt: Date.now() + CHALLENGE_LIFETIME_MS });
  return { options, challengeToken };
}
export async function finishLogin(input: Dependencies & { challengeToken: string; response: unknown }) {
  const { store, config, authenticator } = input;
  const challenge = store.consumeChallenge(input.challengeToken, "login");
  if (!challenge) throw new Error("La solicitud venció. Volvé a empezar.");
  requireCurrent(store, challenge);
  const response = input.response as { id?: unknown } | null;
  const passkey = typeof response?.id === "string" ? store.getPasskey(response.id) : null;
  if (!passkey) throw new Error("La passkey no está registrada.");
  const counter = await authenticator.verifyLogin(input.response, challenge.challenge, config, passkey);
  if (counter === null) throw new Error("La passkey no pudo verificarse.");
  return store.atomic(() => {
    requireCurrent(store, challenge);
    const current = store.getPasskey(passkey.id);
    if (!current || current.counter !== passkey.counter || current.publicKey.length !== passkey.publicKey.length || !current.publicKey.every((byte, i) => byte === passkey.publicKey[i]) || !Number.isSafeInteger(counter) || counter < 0 || (current.counter !== 0 || counter !== 0) && counter <= current.counter) throw new Error("La credencial cambió. Volvé a ingresar.");
    store.updateCounter(current.id, counter);
    return store.createSession(current.id, current.label);
  });
}
export async function beginRecovery(input: Dependencies & { code: string }) {
  const { store, config, authenticator } = input;
  const generation = store.generation(), normalized = normalizeRecoveryCode(input.code);
  if (!normalized || !store.hasRecoveryCode(normalized)) throw new Error("El código de recuperación no es válido.");
  const options = await authenticator.registrationOptions(config, store.getUserId(), store.listPasskeys());
  const challengeToken = authenticator.token();
  store.saveChallenge(challengeToken, { challenge: options.challenge, purpose: "recovery", actor: "recovery", recoveryHash: authenticator.hash(normalized), generation, expiresAt: Date.now() + CHALLENGE_LIFETIME_MS });
  return { options, challengeToken };
}
export async function finishRecovery(input: Dependencies & { challengeToken: string; response: unknown; label: string }) {
  const { store, config, authenticator } = input;
  const challenge = store.consumeChallenge(input.challengeToken, "recovery");
  if (!challenge?.recoveryHash) throw new Error("La solicitud venció. Volvé a empezar.");
  requireCurrent(store, challenge);
  const credential = await authenticator.verifyRegistration(input.response, challenge.challenge, config);
  if (!credential) throw new Error("La passkey no pudo verificarse.");
  const label = input.label.trim().slice(0, 60) || "Dispositivo recuperado", recoveryCodes = authenticator.recoveryCodes();
  const result = store.atomic(() => {
    requireCurrent(store, challenge);
    if (!store.useRecoveryCode(challenge.recoveryHash!)) throw new Error("El código ya se utilizó.");
    store.advanceGeneration(); store.deleteAllPasskeys();
    store.savePasskey({ ...credential, label }); store.revokeAllSessions(); store.replaceRecoveryCodes(recoveryCodes);
    return store.createSession(credential.id, label);
  });
  return { ...result, recoveryCodes };
}
