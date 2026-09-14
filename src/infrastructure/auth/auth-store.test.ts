import { describe, expect, it, vi } from "vitest";
import Database from "better-sqlite3";

vi.mock("server-only", () => ({}));
vi.mock("@simplewebauthn/server", () => ({
  verifyRegistrationResponse: async () => ({
    verified: true,
    registrationInfo: { credential: { id: "recovered", publicKey: new Uint8Array([4, 5, 6]), counter: 0, transports: [] } },
  }),
}));

import { AuthStore, hashSecret } from "./auth-store";
import { finishRecovery } from "@/application/auth/passkey-service";
import type { RegistrationResponseJSON } from "@simplewebauthn/server";

function store() {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE professional (id INTEGER PRIMARY KEY, webauthn_user_id BLOB NOT NULL);
    INSERT INTO professional VALUES (1, x'010203');
    CREATE TABLE passkeys (id TEXT PRIMARY KEY, public_key BLOB NOT NULL, counter INTEGER NOT NULL, transports TEXT NOT NULL, label TEXT NOT NULL, created_at INTEGER NOT NULL, last_used_at INTEGER);
    CREATE TABLE challenges (token_hash TEXT PRIMARY KEY, challenge TEXT NOT NULL, purpose TEXT NOT NULL, actor TEXT NOT NULL, recovery_hash TEXT, expires_at INTEGER NOT NULL);
    CREATE TABLE sessions (id TEXT PRIMARY KEY, token_hash TEXT UNIQUE NOT NULL, credential_id TEXT NOT NULL, label TEXT NOT NULL, created_at INTEGER NOT NULL, last_seen_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, revoked_at INTEGER);
    CREATE TABLE recovery_codes (code_hash TEXT PRIMARY KEY, used_at INTEGER);
  `);
  return new AuthStore(db);
}

function passkey(auth: AuthStore, id: string) {
  auth.savePasskey({ id, publicKey: new Uint8Array([1, 2, 3]), counter: 0, transports: [], label: id });
}

describe("persistencia de acceso", () => {
  it("consume un desafío una sola vez y rechaza uno vencido", () => {
    const auth = store();
    auth.saveChallenge("one", { challenge: "challenge", purpose: "login", actor: "professional", recoveryHash: null, expiresAt: Date.now() + 1000 });
    expect(auth.consumeChallenge("one", "registration")).toBeNull();
    expect(auth.consumeChallenge("one", "login")?.challenge).toBe("challenge");
    expect(auth.consumeChallenge("one", "login")).toBeNull();
    auth.saveChallenge("old", { challenge: "old", purpose: "login", actor: "professional", recoveryHash: null, expiresAt: Date.now() - 1 });
    expect(auth.consumeChallenge("old", "login")).toBeNull();
  });

  it("revoca la sesión individual y la credencial perdida", () => {
    const auth = store();
    passkey(auth, "phone");
    passkey(auth, "laptop");
    const phone = auth.createSession("phone", "Teléfono");
    const laptop = auth.createSession("laptop", "Computadora");
    expect(auth.getSession(phone.token)).not.toBeNull();
    expect(auth.revokeSession(phone.session.id)).toBe(true);
    expect(auth.getSession(phone.token)).toBeNull();
    expect(auth.getSession(laptop.token)).not.toBeNull();
    expect(auth.deletePasskey("laptop")).toBe(true);
    expect(auth.getSession(laptop.token)).toBeNull();
    expect(auth.deletePasskey("phone")).toBe(false);
  });

  it("consume un código de recuperación una sola vez y permite rotarlo", () => {
    const auth = store();
    auth.replaceRecoveryCodes(["aaaa"]);
    expect(auth.hasRecoveryCode("aaaa")).toBe(true);
    expect(auth.useRecoveryCode(hashSecret("aaaa"))).toBe(true);
    expect(auth.useRecoveryCode(hashSecret("aaaa"))).toBe(false);
    auth.replaceRecoveryCodes(["bbbb"]);
    expect(auth.hasRecoveryCode("aaaa")).toBe(false);
    expect(auth.hasRecoveryCode("bbbb")).toBe(true);
  });

  it("la recuperación invalida passkeys, sesiones y códigos anteriores", async () => {
    const auth = store();
    passkey(auth, "lost");
    const prior = auth.createSession("lost", "Perdido");
    auth.replaceRecoveryCodes(["aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"]);
    auth.saveChallenge("challenge-token", { challenge: "webauthn-challenge", purpose: "recovery", actor: "recovery", recoveryHash: hashSecret("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"), expiresAt: Date.now() + 1000 });
    const result = await finishRecovery({
      store: auth,
      config: { origin: "http://localhost:3001", rpID: "localhost", dbPath: ":memory:" },
      challengeToken: "challenge-token",
      response: {} as RegistrationResponseJSON,
      label: "Nuevo teléfono",
    });
    expect(auth.getPasskey("lost")).toBeNull();
    expect(auth.getPasskey("recovered")?.label).toBe("Nuevo teléfono");
    expect(auth.getSession(prior.token)).toBeNull();
    expect(auth.getSession(result.token)).not.toBeNull();
    expect(auth.hasRecoveryCode("bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb")).toBe(false);
    expect(result.recoveryCodes).toHaveLength(10);
    expect(auth.hasRecoveryCode(result.recoveryCodes[0])).toBe(true);
  });
});
