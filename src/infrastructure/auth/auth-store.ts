import "server-only";

import { chmodSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import Database from "better-sqlite3";
import type { AuthConfig } from "./auth.config";

export const hashSecret = (value: string) => createHash("sha256").update(value).digest("hex");
export const createToken = () => randomBytes(32).toString("base64url");

export interface StoredPasskey {
  id: string;
  publicKey: Uint8Array;
  counter: number;
  transports: string[];
  label: string;
  createdAt: number;
  lastUsedAt: number | null;
}

export interface StoredSession {
  id: string;
  tokenHash: string;
  credentialId: string;
  label: string;
  createdAt: number;
  lastSeenAt: number;
  expiresAt: number;
  revokedAt: number | null;
}

export interface StoredChallenge {
  challenge: string;
  purpose: "registration" | "login" | "recovery";
  actor: string;
  recoveryHash: string | null;
  expiresAt: number;
}

function createDatabase(path: string) {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const db = new Database(path);
  chmodSync(path, 0o600);
  db.pragma("foreign_keys = ON");
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS professional (
      id INTEGER PRIMARY KEY CHECK (id = 1), webauthn_user_id BLOB NOT NULL
    );
    CREATE TABLE IF NOT EXISTS passkeys (
      id TEXT PRIMARY KEY, public_key BLOB NOT NULL, counter INTEGER NOT NULL,
      transports TEXT NOT NULL, label TEXT NOT NULL, created_at INTEGER NOT NULL,
      last_used_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS challenges (
      token_hash TEXT PRIMARY KEY, challenge TEXT NOT NULL,
      purpose TEXT NOT NULL, actor TEXT NOT NULL, recovery_hash TEXT,
      expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY, token_hash TEXT UNIQUE NOT NULL,
      credential_id TEXT NOT NULL, label TEXT NOT NULL,
      created_at INTEGER NOT NULL, last_seen_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL, revoked_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS recovery_codes (
      code_hash TEXT PRIMARY KEY, used_at INTEGER
    );
  `);
  db.prepare("INSERT OR IGNORE INTO professional (id, webauthn_user_id) VALUES (1, ?)").run(randomBytes(32));
  return db;
}

const instances = new Map<string, Database.Database>();

export function openAuthStore(config: AuthConfig) {
  let db = instances.get(config.dbPath);
  if (!db) {
    db = createDatabase(config.dbPath);
    instances.set(config.dbPath, db);
  }
  return new AuthStore(db);
}

export class AuthStore {
  constructor(private readonly db: Database.Database) {}

  atomic<T>(operation: () => T): T { return this.db.transaction(operation)(); }

  getUserId(): Uint8Array {
    const row = this.db.prepare("SELECT webauthn_user_id AS value FROM professional WHERE id = 1").get() as { value: Buffer };
    return new Uint8Array(row.value);
  }

  listPasskeys(): StoredPasskey[] {
    const rows = this.db.prepare("SELECT id, public_key, counter, transports, label, created_at, last_used_at FROM passkeys ORDER BY created_at").all() as Array<{
      id: string; public_key: Buffer; counter: number; transports: string; label: string; created_at: number; last_used_at: number | null;
    }>;
    return rows.map((row) => ({
      id: row.id, publicKey: new Uint8Array(row.public_key), counter: row.counter,
      transports: JSON.parse(row.transports) as string[], label: row.label,
      createdAt: row.created_at, lastUsedAt: row.last_used_at,
    }));
  }

  getPasskey(id: string): StoredPasskey | null {
    return this.listPasskeys().find((item) => item.id === id) ?? null;
  }

  savePasskey(input: Omit<StoredPasskey, "createdAt" | "lastUsedAt">) {
    this.db.prepare("INSERT INTO passkeys (id, public_key, counter, transports, label, created_at) VALUES (?, ?, ?, ?, ?, ?)")
      .run(input.id, Buffer.from(input.publicKey), input.counter, JSON.stringify(input.transports), input.label, Date.now());
  }

  updateCounter(id: string, counter: number) {
    this.db.prepare("UPDATE passkeys SET counter = ?, last_used_at = ? WHERE id = ?").run(counter, Date.now(), id);
  }

  saveChallenge(token: string, challenge: StoredChallenge) {
    this.db.prepare("DELETE FROM challenges WHERE expires_at < ?").run(Date.now());
    this.db.prepare("INSERT INTO challenges (token_hash, challenge, purpose, actor, recovery_hash, expires_at) VALUES (?, ?, ?, ?, ?, ?)")
      .run(hashSecret(token), challenge.challenge, challenge.purpose, challenge.actor, challenge.recoveryHash, challenge.expiresAt);
  }

  consumeChallenge(token: string, purpose: StoredChallenge["purpose"]): StoredChallenge | null {
    const transaction = this.db.transaction(() => {
      const row = this.db.prepare("SELECT * FROM challenges WHERE token_hash = ? AND purpose = ?").get(hashSecret(token), purpose) as {
        challenge: string; purpose: StoredChallenge["purpose"]; actor: string; recovery_hash: string | null; expires_at: number;
      } | undefined;
      if (!row) return null;
      this.db.prepare("DELETE FROM challenges WHERE token_hash = ?").run(hashSecret(token));
      if (row.expires_at < Date.now()) return null;
      return { challenge: row.challenge, purpose: row.purpose, actor: row.actor, recoveryHash: row.recovery_hash, expiresAt: row.expires_at };
    });
    return transaction();
  }

  createSession(credentialId: string, label: string) {
    const token = createToken();
    const now = Date.now();
    const session: StoredSession = { id: randomUUID(), tokenHash: hashSecret(token), credentialId, label, createdAt: now, lastSeenAt: now, expiresAt: now + 30 * 24 * 60 * 60 * 1000, revokedAt: null };
    this.db.prepare("INSERT INTO sessions (id, token_hash, credential_id, label, created_at, last_seen_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run(session.id, session.tokenHash, credentialId, label, now, now, session.expiresAt);
    return { token, session };
  }

  getSession(token: string): StoredSession | null {
    const row = this.db.prepare("SELECT id, token_hash, credential_id, label, created_at, last_seen_at, expires_at, revoked_at FROM sessions WHERE token_hash = ?").get(hashSecret(token)) as {
      id: string; token_hash: string; credential_id: string; label: string; created_at: number; last_seen_at: number; expires_at: number; revoked_at: number | null;
    } | undefined;
    if (!row || row.revoked_at || row.expires_at <= Date.now()) return null;
    return { id: row.id, tokenHash: row.token_hash, credentialId: row.credential_id, label: row.label, createdAt: row.created_at, lastSeenAt: row.last_seen_at, expiresAt: row.expires_at, revokedAt: row.revoked_at };
  }

  touchSession(id: string) {
    const now = Date.now();
    const expiresAt = now + 30 * 24 * 60 * 60 * 1000;
    this.db.prepare("UPDATE sessions SET last_seen_at = ?, expires_at = ? WHERE id = ? AND revoked_at IS NULL AND expires_at > ?").run(now, expiresAt, id, now);
    return expiresAt;
  }

  listSessions(): StoredSession[] {
    const rows = this.db.prepare("SELECT id, token_hash, credential_id, label, created_at, last_seen_at, expires_at, revoked_at FROM sessions WHERE revoked_at IS NULL AND expires_at > ? ORDER BY last_seen_at DESC").all(Date.now()) as Array<{
      id: string; token_hash: string; credential_id: string; label: string; created_at: number; last_seen_at: number; expires_at: number; revoked_at: number | null;
    }>;
    return rows.map((row) => ({ id: row.id, tokenHash: row.token_hash, credentialId: row.credential_id, label: row.label, createdAt: row.created_at, lastSeenAt: row.last_seen_at, expiresAt: row.expires_at, revokedAt: row.revoked_at }));
  }

  revokeSession(id: string) {
    return this.db.prepare("UPDATE sessions SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL").run(Date.now(), id).changes > 0;
  }

  revokeAllSessions() { this.db.prepare("UPDATE sessions SET revoked_at = ? WHERE revoked_at IS NULL").run(Date.now()); }

  deletePasskey(id: string) {
    return this.atomic(() => {
      if (this.listPasskeys().length <= 1) return false;
      const deleted = this.db.prepare("DELETE FROM passkeys WHERE id = ?").run(id).changes > 0;
      if (deleted) this.db.prepare("UPDATE sessions SET revoked_at = ? WHERE credential_id = ? AND revoked_at IS NULL").run(Date.now(), id);
      return deleted;
    });
  }

  deleteAllPasskeys() { this.db.prepare("DELETE FROM passkeys").run(); }

  replaceRecoveryCodes(codes: string[]) {
    this.db.transaction(() => {
      this.db.prepare("DELETE FROM recovery_codes").run();
      const insert = this.db.prepare("INSERT INTO recovery_codes (code_hash) VALUES (?)");
      codes.forEach((code) => insert.run(hashSecret(code)));
    })();
  }

  hasRecoveryCode(code: string) {
    return Boolean(this.db.prepare("SELECT 1 FROM recovery_codes WHERE code_hash = ? AND used_at IS NULL").get(hashSecret(code)));
  }

  useRecoveryCode(hash: string) {
    return this.db.prepare("UPDATE recovery_codes SET used_at = ? WHERE code_hash = ? AND used_at IS NULL").run(Date.now(), hash).changes > 0;
  }

  hasActiveSessionId(id: string) {
    return Boolean(this.db.prepare("SELECT 1 FROM sessions WHERE id = ? AND revoked_at IS NULL AND expires_at > ?").get(id, Date.now()));
  }
}
