const SAFE_URL = "http://localhost:8081/fhir";
const baseUrl = (process.env.FHIR_DEV_RESET_URL ?? SAFE_URL).replace(/\/$/, "");

if (baseUrl !== SAFE_URL) {
  throw new Error(`El reinicio de datos ficticios solo puede ejecutarse contra ${SAFE_URL}.`);
}

const RESOURCE_TYPES = [
  "Procedure",
  "Observation",
  "Encounter",
  "Appointment",
  "EpisodeOfCare",
  "ServiceRequest",
  "Condition",
  "Patient",
  "Practitioner",
];

async function listResourceIds(type) {
  const ids = [];
  let nextUrl = `${baseUrl}/${type}?_count=200`;

  while (nextUrl) {
    const response = await fetch(nextUrl, { headers: { Accept: "application/fhir+json" } });
    if (!response.ok) throw new Error(`No se pudo listar ${type} (${response.status}).`);
    const bundle = await response.json();
    for (const entry of bundle.entry ?? []) {
      if (entry.resource?.id) ids.push(entry.resource.id);
    }
    nextUrl = bundle.link?.find((link) => link.relation === "next")?.url ?? "";
    if (nextUrl && !nextUrl.startsWith(baseUrl)) throw new Error("HAPI devolvió una paginación fuera del endpoint ficticio permitido.");
  }

  return ids;
}

async function removeResource(type, id) {
  const response = await fetch(`${baseUrl}/${type}/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: { Accept: "application/fhir+json" },
  });
  if (!response.ok && response.status !== 404 && response.status !== 410) {
    throw new Error(`No se pudo borrar ${type}/${id} (${response.status}).`);
  }
}

let removed = 0;
for (const type of RESOURCE_TYPES) {
  const ids = await listResourceIds(type);
  for (const id of ids) {
    await removeResource(type, id);
    removed += 1;
  }
}

console.log(`HAPI 8081 limpio: ${removed} recursos ficticios eliminados.`);
await import("./seed-clinical-home.mjs");
