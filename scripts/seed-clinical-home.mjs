const SAFE_URL = "http://localhost:8081/fhir";
const baseUrl = (process.env.FHIR_DEV_SEED_URL ?? SAFE_URL).replace(/\/$/, "");
if (baseUrl !== SAFE_URL) throw new Error(`Los datos ficticios solo pueden escribirse en ${SAFE_URL}.`);

const DAY = 86_400_000;
const localDate = (date) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
const day = (offset) => localDate(new Date(Date.now() + offset * DAY));
const instant = (offset, time) => `${day(offset)}T${time}:00-03:00`;
const addMinutes = (value, minutes) => new Date(new Date(value).getTime() + minutes * 60_000).toISOString();
const url = "https://kinesiologiaadomicilio.local/fhir/StructureDefinition/";
const diagnosisRoleSystem = "https://kinesiologiaadomicilio.local/fhir/CodeSystem/episodeofcare-diagnosis-role-v1";
const seededPatientIds = ["demo-rosa", "demo-alicia", "demo-carlos", "demo-mario", "demo-elena"];
const seededVisitIds = new Set(["demo-visit-rosa-1", "demo-visit-rosa-2", "demo-visit-alicia-1", "demo-visit-carlos-1"]);

async function put(type, id, resource) {
  const response = await fetch(`${baseUrl}/${type}/${id}`, { method: "PUT", headers: { Accept: "application/fhir+json", "Content-Type": "application/fhir+json" }, body: JSON.stringify({ ...resource, resourceType: type, id }) });
  if (!response.ok) throw new Error(`HAPI rechazó ${type}/${id} (${response.status}): ${await response.text()}`);
}

async function closePreviousFixtureVisits() {
  for (const patientId of seededPatientIds) {
    const search = new URLSearchParams({ patient: patientId, _count: "200" });
    const response = await fetch(`${baseUrl}/Encounter?${search}`, { headers: { Accept: "application/fhir+json" } });
    if (!response.ok) throw new Error(`No se pudo preparar el estado ficticio (${response.status}).`);
    const bundle = await response.json();
    for (const entry of bundle.entry ?? []) {
      const resource = entry.resource;
      if (resource?.resourceType === "Encounter" && resource.id && !seededVisitIds.has(resource.id) && resource.status !== "entered-in-error") {
        await put("Encounter", resource.id, { ...resource, status: "entered-in-error" });
      }
    }
  }
}

await closePreviousFixtureVisits();

const patients = [
  ["demo-rosa", "Rosa", "Benítez", "+5492995550101", "Las Mutisias 245, Neuquén", "Portón gris; tocar timbre de la derecha."],
  ["demo-alicia", "Alicia", "Figueroa", "+5492995550104", "Domicilio Demo 1, Neuquén", "Casa de una planta; llamar antes de ingresar."],
  ["demo-carlos", "Carlos", "Méndez", "+5492995550105", "Pasaje Ficticio 84, Neuquén", "Entrada por el portón lateral; hay un escalón alto."],
  ["demo-mario", "Mario", "Acosta", "+5492995550102", "Lago Huechulafquen 830, Neuquén", "Ingresar por cochera; hay un perro en el patio."],
  ["demo-elena", "Elena", "Suárez", "+5492995550103", "Belgrano 1520, Neuquén", "Departamento 2 B; ascensor al fondo."],
];
for (const [id, given, family, phone, address, access] of patients) {
  await put("Patient", id, { name: [{ given: [given], family }], telecom: [{ system: "phone", value: phone }], address: [{ text: address }], extension: [{ url: `${url}patient-home-access-instructions-v1`, valueString: access }] });
}

const conditions = [
  ["demo-condition-rosa-medical", "demo-rosa", "Gonartrosis derecha"],
  ["demo-condition-rosa-kinesio", "demo-rosa", "Limitación funcional para marcha y escaleras"],
  ["demo-condition-alicia-medical", "demo-alicia", "Recuperación funcional posterior a fractura de muñeca"],
  ["demo-condition-carlos-medical", "demo-carlos", "Lumbalgia mecánica"],
];
for (const [id, patientId, text] of conditions) {
  await put("Condition", id, { subject: { reference: `Patient/${patientId}` }, code: { text }, recordedDate: day(-30) });
}

const treatments = [
  {
    id: "demo-treatment-rosa", patientId: "demo-rosa", status: "active", frequency: "2 veces por semana", count: 10,
    precautions: ["Evitar flexión forzada de rodilla"], initial: "Dolor al subir escaleras y dificultad para caminar más de dos cuadras.",
    goals: "Disminuir dolor, mejorar fuerza de miembros inferiores y recuperar autonomía en la marcha.",
    plan: "Movilidad de rodilla, fortalecimiento progresivo, equilibrio y práctica funcional en domicilio.",
    diagnoses: [["demo-condition-rosa-medical", "medical_reference"], ["demo-condition-rosa-kinesio", "kinesiologic_diagnosis"]],
  },
  {
    id: "demo-treatment-alicia", patientId: "demo-alicia", status: "active", frequency: "1 vez por semana", count: 8,
    precautions: ["No cargar peso con la mano afectada sin indicación"], initial: "Rigidez de muñeca y dificultad para tareas domésticas que requieren agarre.",
    goals: "Recuperar movilidad, fuerza de prensión y uso funcional de la mano.",
    plan: "Movilidad activa asistida, ejercicios de prensión graduados y práctica de actividades cotidianas.",
    diagnoses: [["demo-condition-alicia-medical", "medical_reference"]],
  },
  {
    id: "demo-treatment-carlos", patientId: "demo-carlos", status: "active", frequency: "2 veces por semana", count: 6,
    precautions: ["Interrumpir ante irradiación o aumento sostenido del dolor"], initial: "Dolor lumbar al permanecer sentado y al levantarse de la cama.",
    goals: "Mejorar tolerancia postural y retomar caminatas sin aumento del dolor.",
    plan: "Educación postural, movilidad lumbopélvica y fortalecimiento progresivo del tronco.",
    diagnoses: [["demo-condition-carlos-medical", "medical_reference"]],
  },
  { id: "demo-treatment-mario", patientId: "demo-mario", status: "onhold", frequency: "1 vez por semana", count: 8, precautions: ["Controlar tolerancia al esfuerzo"] },
  { id: "demo-treatment-elena", patientId: "demo-elena", status: "finished", frequency: "3 veces por semana", count: 12, precautions: [] },
];
for (const treatment of treatments) {
  await put("EpisodeOfCare", treatment.id, {
    status: treatment.status, patient: { reference: `Patient/${treatment.patientId}` }, period: { start: day(-30), ...(treatment.status === "finished" ? { end: day(-2) } : {}) },
    extension: [
      { url: `${url}episodeofcare-planned-frequency-v1`, valueString: treatment.frequency },
      { url: `${url}episodeofcare-planned-session-count-v1`, valuePositiveInt: treatment.count },
      ...(treatment.initial ? [{ url: `${url}episodeofcare-initial-functional-status-v1`, valueString: treatment.initial }] : []),
      ...(treatment.goals ? [{ url: `${url}episodeofcare-therapeutic-goals-v1`, valueString: treatment.goals }] : []),
      ...(treatment.plan ? [{ url: `${url}episodeofcare-framework-plan-v1`, valueString: treatment.plan }] : []),
      ...treatment.precautions.map((valueString) => ({ url: `${url}episodeofcare-precaution-v1`, valueString })),
    ],
    diagnosis: (treatment.diagnoses ?? []).map(([conditionId, kind]) => ({ condition: { reference: `Condition/${conditionId}` }, role: { coding: [{ system: diagnosisRoleSystem, code: kind }] } })),
  });
}

function appointment(id, patientId, treatmentId, offset, time, status, extra = {}) {
  const start = time ? instant(offset, time) : undefined;
  return put("Appointment", id, {
    status: status ?? (time ? "booked" : "proposed"), created: instant(-5, "09:00"),
    ...(start ? { start, end: addMinutes(start, 60), minutesDuration: 60 } : { requestedPeriod: [{ start: instant(offset, "00:00"), end: instant(offset + 1, "00:00") }] }),
    participant: [{ actor: { reference: `Patient/${patientId}` }, status: "accepted" }],
    supportingInformation: [{ reference: `EpisodeOfCare/${treatmentId}` }], serviceType: [{ text: "Kinesiología domiciliaria" }], ...extra,
  });
}

function finishedVisit(id, patientId, treatmentId, appointmentId, offset, time, note) {
  const start = instant(offset, time);
  return put("Encounter", id, {
    status: "finished", subject: { reference: `Patient/${patientId}` }, episodeOfCare: [{ reference: `EpisodeOfCare/${treatmentId}` }],
    period: { start, end: addMinutes(start, 50) }, appointment: [{ reference: `Appointment/${appointmentId}` }],
    extension: [
      { url: `${url}encounter-capture-mode-v1`, valueString: "live" },
      { url: `${url}encounter-recorded-at-v1`, valueString: addMinutes(start, 55) },
      { url: `${url}encounter-clinical-status-and-response-v1`, valueString: `${note.subjective} ${note.assessment}` },
      { url: `${url}encounter-clinical-intervention`, valueString: note.intervention },
      { url: `${url}encounter-clinical-assessment`, valueString: note.assessment },
      { url: `${url}encounter-clinical-next-plan`, valueString: note.nextPlan },
    ],
  });
}

const evaluationSystem = "https://kinesiologiaadomicilio.local/fhir/CodeSystem/clinical-evaluation";
const domainSystem = "https://kinesiologiaadomicilio.local/fhir/CodeSystem/clinical-evaluation-domain";
const seriesUrl = `${url}observation-series-identity-v1`;
async function evaluation(id, visitId, patientId, offset, time, domain, name, seriesId, result, context = {}) {
  await put("Observation", id, {
    status: "final", subject: { reference: `Patient/${patientId}` }, encounter: { reference: `Encounter/${visitId}` }, effectiveDateTime: instant(offset, time),
    category: [{ coding: [{ system: domainSystem, code: domain }] }], code: { coding: [{ system: evaluationSystem, code: name === "Dolor NRS" ? "pain-nrs" : "custom-evaluation", display: name }], text: name },
    extension: [{ url: seriesUrl, valueIdentifier: { value: seriesId } }, ...(context.laterality ? [{ url: `${url}observation-laterality-v1`, valueCode: context.laterality }] : [])],
    ...result, ...(context.bodySite ? { bodySite: { text: context.bodySite } } : {}), ...(context.method ? { method: { text: context.method } } : {}), ...(context.interpretation ? { note: [{ text: context.interpretation }] } : {}),
  });
}
async function procedure(id, visitId, patientId, offset, time, family, text) {
  const start = instant(offset, time);
  await put("Procedure", id, { status: "completed", code: { coding: [{ system: "https://kinesiologiaadomicilio.local/fhir/CodeSystem/performed-procedure-family", code: family }], text }, subject: { reference: `Patient/${patientId}` }, encounter: { reference: `Encounter/${visitId}` }, performedPeriod: { start, end: addMinutes(start, 50) } });
}

await appointment("demo-appt-overdue", "demo-rosa", "demo-treatment-rosa", -1, "11:00");
await appointment("demo-appt-today", "demo-alicia", "demo-treatment-alicia", 0, "18:00");
await appointment("demo-appt-no-time", "demo-carlos", "demo-treatment-carlos", 0);
await appointment("demo-appt-tomorrow", "demo-rosa", "demo-treatment-rosa", 1, "10:30");
await appointment("demo-appt-day-after", "demo-alicia", "demo-treatment-alicia", 2, "11:00");
await appointment("demo-appt-next-block", "demo-rosa", "demo-treatment-rosa", 35, "09:30");
await appointment("demo-appt-cancelled", "demo-carlos", "demo-treatment-carlos", 0, "08:00", "cancelled", { cancelationReason: { coding: [{ system: "https://kinesiologiaadomicilio.local/fhir/CodeSystem/appointment-change-reason-v1", code: "logistics-or-weather" }], text: "Cambio ficticio por clima" } });

const history = [
  ["demo-appt-rosa-history-1", "demo-visit-rosa-1", "demo-rosa", "demo-treatment-rosa", -10, "10:00", { subjective: "Dolor 6/10 al subir escalones.", intervention: "Movilidad de rodilla y fortalecimiento de cuádriceps.", assessment: "Buena tolerancia, con fatiga al final de la serie.", nextPlan: "Progresar repeticiones y revisar técnica en escaleras." }],
  ["demo-appt-rosa-history-2", "demo-visit-rosa-2", "demo-rosa", "demo-treatment-rosa", -5, "10:00", { subjective: "Refiere menor dolor durante caminatas cortas.", intervention: "Fortalecimiento, equilibrio y práctica de marcha.", assessment: "Mejor control de apoyo y dolor 4/10.", nextPlan: "Aumentar distancia de marcha según tolerancia." }],
  ["demo-appt-alicia-history-1", "demo-visit-alicia-1", "demo-alicia", "demo-treatment-alicia", -7, "17:00", { subjective: "Rigidez matinal y dificultad para abrir frascos.", intervention: "Movilidad activa y ejercicios suaves de prensión.", assessment: "Mejora del rango durante la sesión sin aumento del dolor.", nextPlan: "Repetir movilidad diaria y progresar prensión." }],
  ["demo-appt-carlos-history-1", "demo-visit-carlos-1", "demo-carlos", "demo-treatment-carlos", -4, "14:30", { subjective: "Dolor lumbar luego de estar sentado más de una hora.", intervention: "Movilidad lumbopélvica y educación para cambios de postura.", assessment: "Comprende las pautas y realiza ejercicios sin irradiación.", nextPlan: "Incorporar fortalecimiento de tronco en próxima visita." }],
];
for (const [appointmentId, visitId, patientId, treatmentId, offset, time, note] of history) {
  await appointment(appointmentId, patientId, treatmentId, offset, time, "fulfilled");
  await finishedVisit(visitId, patientId, treatmentId, appointmentId, offset, time, note);
}

const painSeries = "7c4bfd31-05d0-4c8f-a1b1-c77ac5ed0a01";
const kneeSeries = "7c4bfd31-05d0-4c8f-a1b1-c77ac5ed0a02";
await evaluation("demo-eval-rosa-pain-1", "demo-visit-rosa-1", "demo-rosa", -10, "10:00", "pain-symptoms", "Dolor NRS", painSeries, { valueQuantity: { value: 6, unit: "0–10" } });
await evaluation("demo-eval-rosa-pain-2", "demo-visit-rosa-2", "demo-rosa", -5, "10:00", "pain-symptoms", "Dolor NRS", painSeries, { valueQuantity: { value: 4, unit: "0–10" } });
await evaluation("demo-eval-rosa-knee-1", "demo-visit-rosa-1", "demo-rosa", -10, "10:00", "joint-mobility", "Flexión de rodilla", kneeSeries, { valueQuantity: { value: 90, unit: "grados" } }, { bodySite: "Rodilla", laterality: "right", method: "Goniómetro" });
await evaluation("demo-eval-rosa-knee-2", "demo-visit-rosa-2", "demo-rosa", -5, "10:00", "joint-mobility", "Flexión de rodilla", kneeSeries, { valueQuantity: { value: 102, unit: "grados" } }, { bodySite: "Rodilla", laterality: "right", method: "Goniómetro", interpretation: "Mejor tolerancia ficticia" });
await evaluation("demo-eval-alicia-grip", "demo-visit-alicia-1", "demo-alicia", -7, "17:00", "strength", "Prensión funcional", "7c4bfd31-05d0-4c8f-a1b1-c77ac5ed0a03", { valueCodeableConcept: { text: "Limitada" } });
await evaluation("demo-eval-carlos-balance", "demo-visit-carlos-1", "demo-carlos", -4, "14:30", "balance-falls", "Apoyo unipodal", "7c4bfd31-05d0-4c8f-a1b1-c77ac5ed0a04", { dataAbsentReason: { coding: [{ system: "https://kinesiologiaadomicilio.local/fhir/CodeSystem/clinical-evaluation-absent-reason", code: "unsafe-contraindicated" }], text: "No realizado por seguridad en este ejemplo ficticio" } });
await procedure("demo-proc-rosa-1-exercise", "demo-visit-rosa-1", "demo-rosa", -10, "10:00", "therapeutic-exercise", "Ejercicio terapéutico");
await procedure("demo-proc-rosa-1-education", "demo-visit-rosa-1", "demo-rosa", -10, "10:00", "education-instructions", "Educación e indicaciones");
await procedure("demo-proc-rosa-2-gait", "demo-visit-rosa-2", "demo-rosa", -5, "10:00", "gait-transfers", "Marcha y transferencias");
await procedure("demo-proc-alicia-manual", "demo-visit-alicia-1", "demo-alicia", -7, "17:00", "manual-therapy", "Terapia manual");

console.log("Datos ficticios variados de agenda y pacientes listos en HAPI 8081.");
