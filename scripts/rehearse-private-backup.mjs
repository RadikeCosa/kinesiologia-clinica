// Fictitious-only operational rehearsal. Never reads or connects to production.
import { spawnSync } from "node:child_process";
import { randomUUID, randomBytes, createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, openSync, closeSync, chmodSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import Database from "better-sqlite3";

process.umask(0o077);
const source = "http://localhost:8081/fhir";
if (process.env.CLINICAL_MODE === "pilot" || process.env.FHIR_BASE_URL && process.env.FHIR_BASE_URL.replace(/\/$/, "") !== source) throw new Error("Rehearsal only permits fictional mode and HAPI 8081.");
const id = randomUUID();
const prefix = `clinical-restore-${id.slice(0, 8)}`;
const dbName = `${prefix}-db`, hapiName = `${prefix}-hapi`, volumeName = `${prefix}-data`;
const password = randomBytes(32).toString("hex");
const dockerEnv = { ...process.env, POSTGRES_PASSWORD: password, SPRING_DATASOURCE_PASSWORD: password };
const directory = resolve(".local/backup-rehearsals");
mkdirSync(directory, { recursive: true, mode: 0o700 });
const output = mkdtempSync(join(directory, "run-"));
chmodSync(output, 0o700);
const resources = [
  { resourceType: "Patient", id: `rehearsal-${id}`, name: [{ text: "Persona completamente ficticia" }] },
  { resourceType: "ServiceRequest", id: `rehearsal-${id}`, status: "active", intent: "order", subject: { reference: `Patient/rehearsal-${id}` }, code: { text: "Consulta inventada de recuperación" } },
  { resourceType: "Encounter", id: `rehearsal-${id}`, status: "finished", class: { system: "http://terminology.hl7.org/CodeSystem/v3-ActCode", code: "HH" }, subject: { reference: `Patient/rehearsal-${id}` }, basedOn: [{ reference: `ServiceRequest/rehearsal-${id}` }], period: { start: "2026-10-01T12:00:00Z", end: "2026-10-01T12:50:00Z" } },
  { resourceType: "Observation", id: `rehearsal-${id}`, status: "final", code: { text: "Medición completamente inventada" }, subject: { reference: `Patient/rehearsal-${id}` }, encounter: { reference: `Encounter/rehearsal-${id}` }, valueString: "Resultado ficticio para comprobar recuperación" },
];
const created = [];
const evidence = { fictionalOnly: true, startedAt: new Date().toISOString(), checks: {} };
function docker(args, options = {}) {
  const result = spawnSync("docker", args, { env: dockerEnv, encoding: "utf8", timeout: 120_000, maxBuffer: 2_000_000, ...options });
  // Never print Docker stderr: configuration failures can contain sensitive values.
  if (result.error || result.status !== 0) throw new Error(`Docker operation failed: ${args[0]} (details withheld).`);
  return result.stdout?.trim();
}
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function waitFor(check, timeout = 120_000) {
  const limit = Date.now() + timeout;
  while (Date.now() < limit) { try { if (await check()) return; } catch { /* Startup only; no payload logging. */ } await delay(1500); }
  throw new Error("Isolated service did not become ready.");
}
async function get(base, resource) {
  const response = await fetch(`${base}/${resource.resourceType}/${resource.id}`, { signal: AbortSignal.timeout(10_000), headers: { Accept: "application/fhir+json" } });
  if (!response.ok) throw new Error(`Fictitious resource unavailable (${response.status}).`);
  const { meta, ...value } = await response.json(); void meta;
  return JSON.stringify(value);
}
let auth;
try {
  const sourceLabel = docker(["inspect", "--format", '{{index .Config.Labels "com.docker.compose.project"}}', "hapi-dev-db-1"]);
  if (sourceLabel !== "hapi-dev") throw new Error("Source database does not belong to the fictional project.");
  for (const resource of resources) {
    const response = await fetch(`${source}/${resource.resourceType}/${resource.id}`, { method: "PUT", headers: { "Content-Type": "application/fhir+json", "If-None-Match": "*" }, body: JSON.stringify(resource), signal: AbortSignal.timeout(20_000) });
    if (!response.ok) throw new Error(`Fictitious fixture could not be created (${response.status}).`);
    created.push(resource);
  }
  const expected = await Promise.all(resources.map(r => get(source, r)));
  const dump = join(output, "fictional-fhir.dump");
  const dumpFd = openSync(dump, "wx", 0o600);
  try { docker(["exec", "hapi-dev-db-1", "sh", "-c", 'exec pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc'], { stdio: ["ignore", dumpFd, "pipe"] }); } finally { closeSync(dumpFd); }
  evidence.checks.fhirBackup = true;
  console.log("Fictitious FHIR backup created; starting isolated restore.");
  docker(["network", "create", prefix]); created.push("network");
  docker(["volume", "create", "--label", "clinical.fictional-rehearsal=true", volumeName]); created.push("volume");
  docker(["run", "-d", "--name", dbName, "--network", prefix, "--label", "clinical.fictional-rehearsal=true", "--mount", `type=volume,source=${volumeName},target=/var/lib/postgresql/data`, "-e", "POSTGRES_DB=rehearsal", "-e", "POSTGRES_USER=rehearsal", "-e", "POSTGRES_PASSWORD", "postgres:16"]); created.push("db");
  await waitFor(() => docker(["exec", dbName, "pg_isready", "-U", "rehearsal", "-d", "rehearsal"]).includes("accepting connections"));
  const dumpInput = openSync(dump, "r");
  try { docker(["exec", "-i", dbName, "pg_restore", "-U", "rehearsal", "-d", "rehearsal", "--no-owner", "--no-acl", "--exit-on-error"], { stdio: [dumpInput, "ignore", "pipe"] }); } finally { closeSync(dumpInput); }
  docker(["run", "-d", "--name", hapiName, "--network", prefix, "--label", "clinical.fictional-rehearsal=true", "-p", "127.0.0.1::8080", "-e", `SPRING_DATASOURCE_URL=jdbc:postgresql://${dbName}:5432/rehearsal`, "-e", "SPRING_DATASOURCE_USERNAME=rehearsal", "-e", "SPRING_DATASOURCE_PASSWORD", "-e", "SPRING_DATASOURCE_DRIVERCLASSNAME=org.postgresql.Driver", "-e", "HAPI_FHIR_FHIR_VERSION=R4", "hapiproject/hapi:v8.8.0-1"]); created.push("hapi");
  const binding = JSON.parse(docker(["inspect", "--format", '{{json (index .NetworkSettings.Ports "8080/tcp")}}', hapiName]));
  if (!binding || binding.length !== 1 || binding[0].HostIp !== "127.0.0.1") throw new Error("Restore listener is not loopback-only.");
  let restored = `http://127.0.0.1:${binding[0].HostPort}/fhir`;
  await waitFor(async () => (await fetch(`${restored}/metadata`, { signal: AbortSignal.timeout(3000) })).ok);
  const actual = await Promise.all(resources.map(r => get(restored, r)));
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error("Restored fictional resources differ from source.");
  evidence.checks.fhirRestore = true;
  console.log("Restored fictional links, encounter and observation match. Restarting isolated HAPI.");
  docker(["stop", hapiName]);
  docker(["restart", dbName]);
  await waitFor(() => docker(["exec", dbName, "pg_isready", "-U", "rehearsal", "-d", "rehearsal"]).includes("accepting connections"));
  docker(["start", hapiName]);
  const restartedBinding = JSON.parse(docker(["inspect", "--format", '{{json (index .NetworkSettings.Ports "8080/tcp")}}', hapiName]));
  if (!restartedBinding || restartedBinding.length !== 1 || restartedBinding[0].HostIp !== "127.0.0.1") throw new Error("Restart listener is not loopback-only.");
  restored = `http://127.0.0.1:${restartedBinding[0].HostPort}/fhir`;
  await waitFor(async () => (await fetch(`${restored}/metadata`, { signal: AbortSignal.timeout(3000) })).ok);
  if (JSON.stringify(await Promise.all(resources.map(r => get(restored, r)))) !== JSON.stringify(expected)) throw new Error("Fictional resources changed after restart.");
  evidence.checks.fhirRestart = true;
  // A separate invented auth DB, never the professional's authentication store.
  auth = new Database(join(output, "fictional-auth.sqlite"));
  auth.pragma("journal_mode = WAL");
  auth.exec("CREATE TABLE sessions (id TEXT PRIMARY KEY, token_hash TEXT NOT NULL, revoked_at INTEGER); CREATE TABLE passkeys (id TEXT PRIMARY KEY, public_key BLOB NOT NULL)");
  const tokenHash = createHash("sha256").update(randomBytes(32)).digest("hex");
  auth.prepare("INSERT INTO sessions VALUES (?, ?, NULL)").run(id, tokenHash);
  auth.prepare("INSERT INTO passkeys VALUES (?, ?)").run(id, randomBytes(32));
  const authBackup = join(output, "fictional-auth-backup.sqlite");
  await auth.backup(authBackup);
  const copy = new Database(authBackup, { readonly: true });
  try {
    if (copy.pragma("integrity_check", { simple: true }) !== "ok" || copy.prepare("SELECT token_hash FROM sessions WHERE id=?").get(id)?.token_hash !== tokenHash || copy.prepare("SELECT count(*) AS n FROM passkeys").get().n !== 1) throw new Error("Invented authentication backup differs.");
  } finally { copy.close(); }
  evidence.checks.sqliteOnlineBackup = true;
  evidence.dumpSha256 = createHash("sha256").update(readFileSync(dump)).digest("hex");
  evidence.completedAt = new Date().toISOString();
  console.log("FHIR restart and invented SQLite backup verified. Production was not accessed.");
} catch (error) {
  evidence.failed = error.message;
  process.exitCode = 1;
  console.error(error.message);
} finally {
  auth?.close();
  for (const name of ["hapi", "db"]) if (created.includes(name)) { try { docker(["rm", "-f", name === "hapi" ? hapiName : dbName]); } catch { evidence.cleanupFailed = true; process.exitCode = 1; } }
  if (created.includes("volume")) { try { docker(["volume", "rm", volumeName]); } catch { evidence.cleanupFailed = true; process.exitCode = 1; } }
  if (created.includes("network")) { try { docker(["network", "rm", prefix]); } catch { evidence.cleanupFailed = true; process.exitCode = 1; } }
  for (const resource of [...resources].reverse()) {
    if (!created.includes(resource)) continue;
    try { const response = await fetch(`${source}/${resource.resourceType}/${resource.id}`, { method: "DELETE", signal: AbortSignal.timeout(15_000) }); if (!response.ok && ![404, 410].includes(response.status)) throw new Error(); } catch { evidence.cleanupFailed = true; process.exitCode = 1; }
  }
  writeFileSync(join(output, "evidence.json"), JSON.stringify(evidence, null, 2), { mode: 0o600 });
  console.log(`Evidence saved under .local/backup-rehearsals/${output.split("/").at(-1)} (private, ignored).`);
}
