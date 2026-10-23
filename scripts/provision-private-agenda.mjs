// Provisions infrastructure only. Never seeds patients, appointments or clinical notes.
if (!process.argv.includes("--confirm-private-agenda")) throw new Error("Explicit --confirm-private-agenda is required.");
const base = "http://localhost:8080/fhir";
const headers = { Accept: "application/fhir+json", "Content-Type": "application/fhir+json" };
async function get(type, id) {
  const response = await fetch(`${base}/${type}/${id}`, { headers, signal: AbortSignal.timeout(10_000) });
  if (response.status === 404 || response.status === 410) return null;
  if (!response.ok) throw new Error("Could not verify agenda infrastructure.");
  return response.json();
}
try {
  const deviceId = "clinical-agenda-coordinator", scheduleId = "clinical-agenda-coordinator-v1";
  const device = await get("Device", deviceId), schedule = await get("Schedule", scheduleId);
  if (device && device.status !== "active") throw new Error("Existing coordinator requires manual review; unchanged.");
  if (schedule && (!schedule.active || !schedule.meta?.versionId || !schedule.actor?.some(actor => actor.reference === `Device/${deviceId}`))) throw new Error("Existing schedule requires manual review; unchanged.");
  const resources = [
    ...(device ? [] : [{ resourceType: "Device", id: deviceId, status: "active", type: { text: "Coordinador de agenda clínica" } }]),
    ...(schedule ? [] : [{ resourceType: "Schedule", id: scheduleId, active: true, actor: [{ reference: `Device/${deviceId}` }], serviceType: [{ text: "Kinesiología domiciliaria" }] }]),
  ];
  if (resources.length) {
    const response = await fetch(base, { method: "POST", headers, signal: AbortSignal.timeout(20_000), body: JSON.stringify({ resourceType: "Bundle", type: "transaction", entry: resources.map(resource => ({ resource, request: { method: "PUT", url: `${resource.resourceType}/${resource.id}`, ifNoneMatch: "*" } })) }) });
    if (!response.ok && ![409, 412].includes(response.status)) throw new Error("Agenda provisioning failed; payload withheld.");
  }
  const verified = await get("Schedule", scheduleId);
  const verifiedDevice = await get("Device", deviceId);
  if (!verified?.active || !verified.meta?.versionId || !verified.actor?.some(actor => actor.reference === `Device/${deviceId}`) || verifiedDevice?.status !== "active") throw new Error("Agenda could not be verified.");
  console.log(JSON.stringify({ coordinatorProvisioned: true, versionedSchedule: true, clinicalRecordsCreated: false, existingResourcesOverwritten: false }));
} catch { console.error("Private agenda verification failed; no clinical payloads printed."); process.exitCode = 1; }
