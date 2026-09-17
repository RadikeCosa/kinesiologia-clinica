import { createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import Database from "better-sqlite3";
import { removeE2eResources } from "./global-teardown";

export default async function globalSetup() {
  await removeE2eResources();
  mkdirSync(".local", { recursive: true });
  writeFileSync(".local/e2e-fhir-ids.json", JSON.stringify({ overlap: randomUUID(), reschedule: randomUUID() }));
  const database = new Database(".local/e2e-auth.sqlite");
  database.exec(`
    CREATE TABLE IF NOT EXISTS professional (id INTEGER PRIMARY KEY CHECK (id = 1), webauthn_user_id BLOB NOT NULL);
    CREATE TABLE IF NOT EXISTS passkeys (id TEXT PRIMARY KEY, public_key BLOB NOT NULL, counter INTEGER NOT NULL, transports TEXT NOT NULL, label TEXT NOT NULL, created_at INTEGER NOT NULL, last_used_at INTEGER);
    CREATE TABLE IF NOT EXISTS challenges (token_hash TEXT PRIMARY KEY, challenge TEXT NOT NULL, purpose TEXT NOT NULL, actor TEXT NOT NULL, recovery_hash TEXT, expires_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, token_hash TEXT UNIQUE NOT NULL, credential_id TEXT NOT NULL, label TEXT NOT NULL, created_at INTEGER NOT NULL, last_seen_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, revoked_at INTEGER);
    CREATE TABLE IF NOT EXISTS recovery_codes (code_hash TEXT PRIMARY KEY, used_at INTEGER);
  `);
  database.prepare("INSERT OR IGNORE INTO professional (id, webauthn_user_id) VALUES (1, ?)").run(randomBytes(32));
  const token = randomBytes(32).toString("base64url");
  const now = Date.now();
  database.prepare("DELETE FROM sessions").run();
  database.prepare("INSERT INTO sessions (id, token_hash, credential_id, label, created_at, last_seen_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run(randomUUID(), createHash("sha256").update(token).digest("hex"), "e2e-passkey", "Playwright", now, now, now + 3_600_000);
  database.close();
  writeFileSync(".local/e2e-storage.json", JSON.stringify({ cookies: [{ name: "clinical_session", value: token, domain: "localhost", path: "/", expires: Math.floor(now / 1000) + 3600, httpOnly: true, secure: false, sameSite: "Strict" }], origins: [] }));
}
