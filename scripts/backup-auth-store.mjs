// Online backup of the configured account. Never prints credentials or modifies sessions.
import nextEnv from "@next/env";
import Database from "better-sqlite3";
import { mkdirSync, mkdtempSync, statSync, chmodSync, writeFileSync } from "node:fs";
import { resolve, join, basename, isAbsolute, sep } from "node:path";
import { createHash } from "node:crypto";

if (!process.argv.includes("--confirm-private-backup")) throw new Error("Explicit --confirm-private-backup is required.");
process.umask(0o077);
nextEnv.loadEnvConfig(process.cwd(), true, { info() {}, error() {} });
const configured = process.env.AUTH_DB_PATH;
if (!configured || !process.env.AUTH_ORIGIN) throw new Error("Authentication configuration is missing.");
const source = resolve(configured);
if (/e2e|test/i.test(basename(source))) throw new Error("A test database cannot verify the configured professional account.");
const backupRoot = process.env.PRIVATE_BACKUP_ROOT;
if (!backupRoot || !isAbsolute(backupRoot)) throw new Error("An absolute PRIVATE_BACKUP_ROOT outside the repository is required.");
const root = resolve(backupRoot, "auth");
if (root === process.cwd() || root.startsWith(`${process.cwd()}${sep}`)) throw new Error("Backups must be stored outside the repository.");
mkdirSync(root, { recursive: true, mode: 0o700 });
chmodSync(root, 0o700);
const output = mkdtempSync(join(root, "account-"));
chmodSync(output, 0o700);
const tables = ["professional", "passkeys", "challenges", "sessions", "recovery_codes"];
function fingerprint(database) {
  const hash = createHash("sha256");
  for (const table of tables) hash.update(JSON.stringify(database.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()));
  return hash.digest("hex");
}
let database, snapshot, restored;
try {
  database = new Database(source, { readonly: true, fileMustExist: true });
  database.pragma("query_only = ON");
  for (const table of tables) database.prepare(`SELECT count(*) FROM ${table}`).get();
  const backup = join(output, "auth.sqlite");
  await database.backup(backup);
  chmodSync(backup, 0o600);
  database.close(); database = null;
  snapshot = new Database(backup, { readonly: true, fileMustExist: true });
  if (snapshot.pragma("integrity_check", { simple: true }) !== "ok") throw new Error("Backup integrity verification failed.");
  const expected = fingerprint(snapshot);
  const verificationCopy = join(output, "restored-verification.sqlite");
  await snapshot.backup(verificationCopy);
  chmodSync(verificationCopy, 0o600);
  restored = new Database(verificationCopy, { readonly: true, fileMustExist: true });
  if (restored.pragma("integrity_check", { simple: true }) !== "ok" || fingerprint(restored) !== expected) throw new Error("Isolated restoration differs from backup.");
  const passkeys = restored.prepare("SELECT count(*) AS n FROM passkeys").get().n;
  const unusedCodes = restored.prepare("SELECT count(*) AS n FROM recovery_codes WHERE used_at IS NULL").get().n;
  const activeSessions = restored.prepare("SELECT count(*) AS n FROM sessions WHERE revoked_at IS NULL AND expires_at > ?").get(Date.now()).n;
  const evidence = {
    completedAt: new Date().toISOString(), configuredStore: true, sourceReadOnly: true,
    onlineBackup: true, integrityCheck: true, isolatedRestorationMatches: true,
    sourceOrigin: process.env.AUTH_ORIGIN,
    passkeyCount: passkeys, unusedRecoveryCodeCount: unusedCodes, activeSessionCount: activeSessions,
    independentAuthenticatorVerified: false, physicalRecoveryVerified: false,
    fingerprint: expected, backupPermissions: (statSync(backup).mode & 0o777).toString(8),
  };
  writeFileSync(join(output, "evidence.json"), JSON.stringify(evidence, null, 2), { mode: 0o600 });
  console.log(JSON.stringify({ onlineBackup: true, integrityCheck: true, isolatedRestorationMatches: true, passkeyCount: passkeys, unusedRecoveryCodeCount: unusedCodes, activeSessionCount: activeSessions, sourceModified: false, storedOutsideRepository: true }));
} catch {
  console.error("Account backup verification failed. Details withheld to protect private configuration; no sessions were intentionally changed.");
  process.exitCode = 1;
} finally { restored?.close(); snapshot?.close(); database?.close(); }
