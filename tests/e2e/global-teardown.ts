import { execFile } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { promisify } from "node:util";

const SAFE_FHIR_URL = "http://localhost:8081/fhir";
const execFileAsync = promisify(execFile);

export async function removeE2eResources() {
  if (!existsSync(".local/e2e-fhir-ids.json")) return;
  const ids = JSON.parse(readFileSync(".local/e2e-fhir-ids.json", "utf8")) as { overlap: string; reschedule: string };
  const resources = [ids.overlap, ids.reschedule].map((id) => `Appointment/appointment-${id}`);
  for (const resource of resources) {
    const response = await fetch(`${SAFE_FHIR_URL}/${resource}`, { method: "DELETE", headers: { Accept: "application/fhir+json" } });
    if (!response.ok && response.status !== 404 && response.status !== 410) {
      throw new Error(`No se pudo limpiar el fixture E2E ${resource} (${response.status}).`);
    }
  }
}

export default async function globalTeardown() {
  await removeE2eResources();
  await execFileAsync(process.execPath, ["scripts/seed-clinical-home.mjs"]);
}
