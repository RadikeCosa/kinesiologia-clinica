import type { ClinicalNote, Visit } from "@/domain/visit/visit";
import { extractIdFromReference } from "@/infrastructure/fhir/core/fhir.references";
import type { FhirResource } from "@/infrastructure/fhir/core/fhir.types";

const BASE = "https://kinesiologiaadomicilio.local/fhir/StructureDefinition/encounter-clinical-";
const CAPTURE_MODE_URL = "https://kinesiologiaadomicilio.local/fhir/StructureDefinition/encounter-capture-mode-v1";
const RECORDED_AT_URL = "https://kinesiologiaadomicilio.local/fhir/StructureDefinition/encounter-recorded-at-v1";
const LEGACY_PUNCTUALITY_URL = "https://kinesiologiaadomicilio.local/fhir/StructureDefinition/encounter-operational-punctuality-v1";
const NOTE_FIELDS = ["statusAndResponse", "subjective", "objective", "intervention", "assessment", "tolerance", "homeInstructions", "nextPlan"] as const;
const SUFFIX = { statusAndResponse: "status-and-response-v1", subjective: "subjective", objective: "objective", intervention: "intervention", assessment: "assessment", tolerance: "tolerance", homeInstructions: "home-instructions", nextPlan: "next-plan" };
const LEGACY = { statusAndResponse: "", subjective: "clinical-subjective:v1:", objective: "clinical-objective:v1:", intervention: "clinical-intervention:v1:", assessment: "clinical-assessment:v1:", tolerance: "clinical-tolerance:v1:", homeInstructions: "clinical-home-instructions:v1:", nextPlan: "clinical-next-plan:v1:" };

export interface FhirEncounter extends FhirResource {
  resourceType: "Encounter";
  status: string;
  subject?: { reference?: string };
  episodeOfCare?: Array<{ reference?: string }>;
  period?: { start?: string; end?: string };
  appointment?: Array<{ reference?: string }>;
  extension?: Array<{ url?: string; valueString?: string; valueCode?: string }>;
  note?: Array<{ text?: string }>;
}

export function mapFhirEncounter(resource: FhirEncounter): Visit {
  const clinicalNote: ClinicalNote = {};
  for (const field of NOTE_FIELDS) {
    const extension = resource.extension?.find((item) => item.url === `${BASE}${SUFFIX[field]}`)?.valueString;
    const legacy = LEGACY[field] ? resource.note?.find((item) => item.text?.startsWith(LEGACY[field]))?.text?.slice(LEGACY[field].length) : undefined;
    const value = extension?.trim() || legacy?.trim();
    if (value) clinicalNote[field] = value;
  }
  if (!clinicalNote.statusAndResponse) {
    const historical = [clinicalNote.subjective, clinicalNote.assessment].filter(Boolean).join("\n\n");
    if (historical) clinicalNote.statusAndResponse = historical;
  }
  return {
    id: resource.id?.trim() ?? "",
    patientId: extractIdFromReference(resource.subject?.reference) ?? "",
    treatmentId: extractIdFromReference(resource.episodeOfCare?.[0]?.reference) ?? "",
    status: resource.status === "finished" ? "finished" : resource.status === "entered-in-error" ? "entered-in-error" : "in-progress",
    startedAt: resource.period?.start ?? "",
    endedAt: resource.period?.end,
    captureMode: resource.extension?.find((item) => item.url === CAPTURE_MODE_URL)?.valueString === "live" ? "live" : resource.extension?.find((item) => item.url === CAPTURE_MODE_URL)?.valueString === "retrospective" ? "retrospective" : undefined,
    recordedAt: resource.extension?.find((item) => item.url === RECORDED_AT_URL)?.valueString,
    appointmentId: extractIdFromReference(resource.appointment?.[0]?.reference),
    version: resource.meta?.versionId,
    legacyStartPunctuality: (() => {
      const code = resource.extension?.find((item) => item.url === LEGACY_PUNCTUALITY_URL)?.valueCode;
      return code === "on_time_or_minor_delay" ? "on-time" : code === "delayed" ? "delayed" : code === "severely_delayed" ? "severely-delayed" : undefined;
    })(),
    clinicalNote: Object.keys(clinicalNote).length ? clinicalNote : undefined,
  };
}

export function mapVisitToFhir(visit: Visit): FhirEncounter {
  const extension: NonNullable<FhirEncounter["extension"]> = NOTE_FIELDS.flatMap((field) => {
    const value = visit.clinicalNote?.[field];
    return value ? [{ url: `${BASE}${SUFFIX[field]}`, valueString: value }] : [];
  });
  if (visit.captureMode) extension.push({ url: CAPTURE_MODE_URL, valueString: visit.captureMode });
  if (visit.recordedAt) extension.push({ url: RECORDED_AT_URL, valueString: visit.recordedAt });
  return {
    resourceType: "Encounter",
    id: visit.id,
    status: visit.status,
    subject: { reference: `Patient/${visit.patientId}` },
    episodeOfCare: [{ reference: `EpisodeOfCare/${visit.treatmentId}` }],
    ...(visit.appointmentId ? { appointment: [{ reference: `Appointment/${visit.appointmentId}` }] } : {}),
    period: { start: visit.startedAt, end: visit.endedAt },
    ...(extension.length ? { extension } : {}),
  };
}
