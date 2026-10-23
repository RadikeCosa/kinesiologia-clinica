// Explicit operational backup; never loads or prints clinical payloads.
import { spawnSync } from "node:child_process";
import { randomUUID, randomBytes, createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, chmodSync, openSync, closeSync, statSync, writeFileSync, createReadStream } from "node:fs";
import { join, resolve, isAbsolute, sep } from "node:path";
if (!process.argv.includes("--confirm-private-fhir-backup")) throw new Error("Explicit private-backup confirmation is required.");
process.umask(0o077);
const name = `private-restore-${randomUUID().slice(0, 12)}`;
const backupRoot = process.env.PRIVATE_BACKUP_ROOT;
if (!backupRoot || !isAbsolute(backupRoot)) throw new Error("An absolute PRIVATE_BACKUP_ROOT outside the repository is required.");
const root = resolve(backupRoot, "fhir");
if (root === process.cwd() || root.startsWith(`${process.cwd()}${sep}`)) throw new Error("Backups must be stored outside the repository.");
mkdirSync(root, { recursive: true, mode: 0o700 }); chmodSync(root, 0o700);
const output = mkdtempSync(join(root, "verified-")); chmodSync(output, 0o700);
const env = { ...process.env, POSTGRES_PASSWORD: randomBytes(32).toString("hex") };
const evidence = { startedAt: new Date().toISOString(), sourceReadOnly: true, restoredToProduction: false };
let created = false, stage = "preflight";
function docker(args, options = {}) {
  const r = spawnSync("docker", args, { env, encoding: "utf8", timeout: 180_000, maxBuffer: 2_000_000, ...options });
  if (r.error || r.status !== 0) throw new Error("Docker operation failed; output withheld.");
  return r.stdout?.trim();
}
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
try {
  if (docker(["inspect", "--format", '{{index .Config.Labels "com.docker.compose.project"}}', "hapi-prod-db-1"]) !== "hapi-prod") throw new Error("Unexpected source project.");
  const bindings = JSON.parse(docker(["inspect", "--format", '{{json .HostConfig.PortBindings}}', "hapi-prod-hapi-1"]));
  if (bindings["8080/tcp"]?.length !== 1 || bindings["8080/tcp"][0].HostIp !== "127.0.0.1") throw new Error("Source HAPI must be loopback-only.");
  let available = false;
  for (let i = 0; i < 80; i++) {
    try { const response = await fetch("http://localhost:8080/fhir/metadata", { headers: { Accept: "application/fhir+json" }, signal: AbortSignal.timeout(3000) }); if (response.ok && (await response.json()).resourceType === "CapabilityStatement") { available = true; break; } } catch { /* Startup: no clinical query or log collection. */ }
    await delay(1500);
  }
  if (!available) throw new Error("Source capability endpoint is unavailable.");
  evidence.loopbackOnly = true; evidence.capabilityAvailable = true;
  stage = "backup";
  const dump = join(output, "fhir.dump"); const fd = openSync(dump, "wx", 0o600);
  try { docker(["exec", "hapi-prod-db-1", "sh", "-c", 'exec pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc'], { stdio: ["ignore", fd, "pipe"] }); } finally { closeSync(fd); }
  if (!statSync(dump).size) throw new Error("Empty backup.");
  evidence.onlineBackup = true;
  console.log("Private backup created outside the repository. Restoring to a temporary network-isolated database.");
  stage = "isolated-restore";
  docker(["run", "-d", "--name", name, "--network", "none", "--label", "clinical.private-restore-verification=true", "--tmpfs", "/var/lib/postgresql/data:rw", "-e", "POSTGRES_DB=verification", "-e", "POSTGRES_USER=verification", "-e", "POSTGRES_PASSWORD", "postgres:16"]); created = true;
  let ready = false;
  for (let i = 0; i < 40; i++) { try { docker(["exec", name, "pg_isready", "-U", "verification", "-d", "verification"]); ready = true; break; } catch { await delay(1000); } }
  if (!ready) throw new Error("Isolated PostgreSQL unavailable.");
  const input = openSync(dump, "r");
  try { docker(["exec", "-i", name, "pg_restore", "-U", "verification", "-d", "verification", "--no-owner", "--no-acl", "--exit-on-error"], { stdio: [input, "ignore", "pipe"] }); } finally { closeSync(input); }
  // Catalog only. Never select patient rows or expose clinical values.
  const tables = Number(docker(["exec", name, "psql", "-U", "verification", "-d", "verification", "-Atc", "SELECT count(*) FROM pg_catalog.pg_tables WHERE schemaname='public'"]));
  if (!Number.isSafeInteger(tables) || tables < 1) throw new Error("Restored schema is empty.");
  const indexProblems = Number(docker(["exec", name, "psql", "-U", "verification", "-d", "verification", "-Atc", "SELECT count(*) FROM pg_catalog.pg_index WHERE NOT indisvalid"]));
  if (indexProblems !== 0) throw new Error("Restored schema has invalid indexes.");
  const hash = createHash("sha256"); for await (const chunk of createReadStream(dump)) hash.update(chunk);
  evidence.backupSha256 = hash.digest("hex"); evidence.restoreSucceeded = true; evidence.restoredPublicTables = tables; evidence.indexesValid = true;
  evidence.completedAt = new Date().toISOString();
  console.log("Private backup restored without errors; schema and indexes checked without reading clinical histories.");
} catch {
  evidence.failedStage = stage; process.exitCode = 1;
  console.error(`Private backup verification failed at ${stage}; payloads and credentials withheld.`);
} finally {
  if (created) { try { docker(["rm", "-f", name]); evidence.temporaryDatabaseRemoved = true; } catch { evidence.cleanupFailed = true; process.exitCode = 1; } }
  writeFileSync(join(output, "evidence.json"), JSON.stringify(evidence, null, 2), { mode: 0o600 });
}
