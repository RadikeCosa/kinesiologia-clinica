import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
vi.mock("server-only", () => ({}));
import { openAuthStore, hashSecret } from "./auth-store";
import { authenticator } from "./webauthn";
import { finishLogin, finishRegistration, finishRecovery } from "@/application/auth/passkey-service";
const paths: string[] = [];
afterEach(() => { for (const path of paths.splice(0)) rmSync(path, { recursive: true, force: true }); });
const key = (id: string, counter = 0) => ({ id, publicKey: new Uint8Array([1, 2, 3]), counter, transports: [], label: "Ficticio" });
function setup() {
 const dir = mkdtempSync(join(tmpdir(), "fictional-auth-race-")); paths.push(dir);
 const config = { origin: "http://localhost:3000", rpID: "localhost", dbPath: join(dir, "auth.sqlite") };
 const store = openAuthStore(config); store.savePasskey(key("phone")); store.savePasskey(key("retained"));
 const runtime = { ...authenticator, verifyLogin: vi.fn(async () => 0), verifyRegistration: vi.fn(async () => key("new")) };
 const input = { store, config, authenticator: runtime };
 function challenge(token: string, purpose: "login" | "registration" | "recovery", actor = "professional") {
  store.saveChallenge(token, { challenge: "fictional", purpose, actor, recoveryHash: purpose === "recovery" ? hashSecret("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa") : null, expiresAt: Date.now() + 60000 });
 }
 return { ...input, input, challenge };
}
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; }
describe("authorization at WebAuthn commit", () => {
 it("rejects login after deleting its credential during verification", async () => {
  const d = setup(), gate = deferred<number>(); d.authenticator.verifyLogin.mockReturnValue(gate.promise); d.challenge("login", "login");
  const pending = finishLogin({ ...d.input, challengeToken: "login", response: { id: "phone" } });
  d.store.deletePasskey("phone"); gate.resolve(0);
  await expect(pending).rejects.toThrow(); expect(d.store.listSessions()).toEqual([]);
 });
 it("rejects enrollment after revoking the actor session", async () => {
  const d = setup(), actor = d.store.createSession("phone", "Ficticio"), gate = deferred<ReturnType<typeof key>>();
  d.authenticator.verifyRegistration.mockReturnValue(gate.promise); d.challenge("register", "registration", actor.session.id);
  const pending = finishRegistration({ ...d.input, challengeToken: "register", response: {}, label: "Ficticio" });
  d.store.revokeSession(actor.session.id); gate.resolve(key("new"));
  await expect(pending).rejects.toThrow(); expect(d.store.getPasskey("new")).toBeNull();
 });
 it("recovery invalidates both a pending login and pending enrollment", async () => {
  const d = setup(), actor = d.store.createSession("phone", "Ficticio"), login = deferred<number>(), registration = deferred<ReturnType<typeof key>>();
  d.authenticator.verifyLogin.mockReturnValue(login.promise); d.authenticator.verifyRegistration.mockReturnValueOnce(registration.promise);
  d.challenge("login", "login"); d.challenge("register", "registration", actor.session.id);
  const a = finishLogin({ ...d.input, challengeToken: "login", response: { id: "phone" } });
  const b = finishRegistration({ ...d.input, challengeToken: "register", response: {}, label: "Ficticio" });
  d.store.replaceRecoveryCodes(["aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"]); d.challenge("recover", "recovery");
  d.authenticator.verifyRegistration.mockResolvedValueOnce(key("recovered"));
  const recovered = await finishRecovery({ ...d.input, challengeToken: "recover", response: {}, label: "Recuperado" });
  login.resolve(0); registration.resolve(key("new"));
  await expect(a).rejects.toThrow(); await expect(b).rejects.toThrow();
  expect(d.store.listPasskeys().map(k => k.id)).toEqual(["recovered"]); expect(d.store.getSession(recovered.token)).not.toBeNull();
 });
 it("rejects stale credential replacement and counter rollback", async () => {
  const d = setup(), gate = deferred<number>(); d.authenticator.verifyLogin.mockReturnValue(gate.promise); d.challenge("login", "login");
  const pending = finishLogin({ ...d.input, challengeToken: "login", response: { id: "phone" } });
  d.store.updateCounter("phone", 2); gate.resolve(1);
  await expect(pending).rejects.toThrow(); expect(d.store.getPasskey("phone")?.counter).toBe(2); expect(d.store.listSessions()).toEqual([]);
 });
 it("preserves counter-zero login and fresh login after session-only revocation", async () => {
  const d = setup(), old = d.store.createSession("phone", "Ficticio"); d.store.revokeSession(old.session.id); d.challenge("login", "login");
  const result = await finishLogin({ ...d.input, challengeToken: "login", response: { id: "phone" } }); expect(d.store.getSession(result.token)).not.toBeNull();
 });
 it("allows enrollment by an active actor and rejects orphan sessions", async () => {
  const d = setup(), actor = d.store.createSession("phone", "Ficticio"); d.challenge("register", "registration", actor.session.id);
  const result = await finishRegistration({ ...d.input, challengeToken: "register", response: {}, label: "Ficticio" }); expect(d.store.getSession(result.token)).not.toBeNull();
  const orphan = d.store.createSession("missing", "Ficticio"); expect(d.store.getSession(orphan.token)).toBeNull(); expect(d.store.hasActiveSessionId(orphan.session.id)).toBe(false);
 });
 it("only permits one concurrent bootstrap commit", async () => {
  const d = setup(); d.store.deleteAllPasskeys(); const a = deferred<ReturnType<typeof key>>(), b = deferred<ReturnType<typeof key>>();
  d.authenticator.verifyRegistration.mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise); d.challenge("a", "registration", "bootstrap"); d.challenge("b", "registration", "bootstrap");
  const first = finishRegistration({ ...d.input, challengeToken: "a", response: {}, label: "Ficticio" }), second = finishRegistration({ ...d.input, challengeToken: "b", response: {}, label: "Ficticio" });
  a.resolve(key("one")); await first; b.resolve(key("two")); await expect(second).rejects.toThrow(); expect(d.store.listPasskeys()).toHaveLength(1);
 });
});

describe("additive auth store migration", () => {
 it("keeps legacy identity, passkeys, sessions and challenges when adding account generations", async () => {
  const Database = (await import("better-sqlite3")).default;
  const dir = mkdtempSync(join(tmpdir(), "fictional-auth-migration-")); paths.push(dir);
  const dbPath = join(dir, "legacy.sqlite"), legacy = new Database(dbPath);
  legacy.exec(`
    CREATE TABLE professional (id INTEGER PRIMARY KEY, webauthn_user_id BLOB NOT NULL);
    INSERT INTO professional VALUES (1, x'010203');
    CREATE TABLE challenges (token_hash TEXT PRIMARY KEY, challenge TEXT NOT NULL, purpose TEXT NOT NULL, actor TEXT NOT NULL, recovery_hash TEXT, expires_at INTEGER NOT NULL);
    CREATE TABLE passkeys (id TEXT PRIMARY KEY, public_key BLOB NOT NULL, counter INTEGER NOT NULL, transports TEXT NOT NULL, label TEXT NOT NULL, created_at INTEGER NOT NULL, last_used_at INTEGER);
    INSERT INTO passkeys VALUES ('legacy', x'010203', 0, '[]', 'Ficticio', 1, NULL);
    CREATE TABLE sessions (id TEXT PRIMARY KEY, token_hash TEXT UNIQUE NOT NULL, credential_id TEXT NOT NULL, label TEXT NOT NULL, created_at INTEGER NOT NULL, last_seen_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, revoked_at INTEGER);
  `);
  legacy.prepare("INSERT INTO sessions VALUES (?, ?, 'legacy', 'Ficticio', 1, 1, ?, NULL)").run("legacy-session", hashSecret("fictional-legacy-token"), Date.now() + 60000);
  legacy.prepare("INSERT INTO challenges VALUES (?, 'fictional', 'login', 'professional', NULL, ?)").run(hashSecret("fictional-challenge"), Date.now() + 60000);
  legacy.close();
  const store = openAuthStore({ origin: "http://localhost:3000", rpID: "localhost", dbPath });
  expect(store.generation()).toBe(0); expect([...store.getUserId()]).toEqual([1, 2, 3]);
  expect(store.getSession("fictional-legacy-token")?.credentialId).toBe("legacy"); expect(store.consumeChallenge("fictional-challenge", "login")?.generation).toBe(0);
 });
});
