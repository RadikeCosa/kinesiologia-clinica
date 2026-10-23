import type { Treatment } from "@/domain/treatment/treatment";
import { extractIdFromReference } from "@/infrastructure/fhir/core/fhir.references";
import type { FhirEpisodeOfCare } from "./episode-of-care.fhir";

const CONTEXT_BASE = "https://kinesiologiaadomicilio.local/fhir/StructureDefinition/";
const DIAGNOSIS_ROLE_SYSTEM = "https://kinesiologiaadomicilio.local/fhir/CodeSystem/episodeofcare-diagnosis-role-v1";
const STATUS_CHANGE_URL = `${CONTEXT_BASE}episodeofcare-status-change-v1`;
const ORIGIN_CONSULTATION_URL = `${CONTEXT_BASE}treatment-origin-consultation-v1`;
const INITIAL_EVALUATION_URL = `${CONTEXT_BASE}treatment-initial-evaluation-v1`;
const ACCEPTED_TREATMENT_QUOTE_URL = `${CONTEXT_BASE}treatment-accepted-budget-v1`;

function readContext(episode: FhirEpisodeOfCare) {
  const read = (suffix: string) => episode.extension?.find((entry) => entry.url === `${CONTEXT_BASE}${suffix}`)?.valueString?.trim() || undefined;
  const context = {
    initialFunctionalStatus: read("episodeofcare-initial-functional-status-v1"),
    therapeuticGoals: read("episodeofcare-therapeutic-goals-v1"),
    frameworkPlan: read("episodeofcare-framework-plan-v1"),
  };
  return Object.values(context).some(Boolean) ? context : undefined;
}

function readDiagnoses(episode: FhirEpisodeOfCare) {
  const references = (episode.diagnosis ?? []).flatMap((entry) => {
    const kind = entry.role?.coding?.find((coding) => coding.system === DIAGNOSIS_ROLE_SYSTEM)?.code;
    const conditionId = extractIdFromReference(entry.condition?.reference);
    if (!conditionId || (kind !== "medical_reference" && kind !== "kinesiologic_diagnosis")) return [];
    return [{ kind: kind as "medical_reference" | "kinesiologic_diagnosis", conditionId }];
  });
  return references.length ? references : undefined;
}

export function mapFhirEpisodeOfCare(
  episode: FhirEpisodeOfCare,
): Treatment {
  return {
    id: episode.id?.trim() || "",
    patientId: extractIdFromReference(episode.patient?.reference) || "",
    sourceConsultationId: extractIdFromReference(episode.extension?.find((entry) => entry.url === ORIGIN_CONSULTATION_URL)?.valueReference?.reference),
    initialEvaluationId: extractIdFromReference(episode.extension?.find((entry) => entry.url === INITIAL_EVALUATION_URL)?.valueReference?.reference),
    acceptedTreatmentQuoteId: episode.extension?.find((entry) => entry.url === ACCEPTED_TREATMENT_QUOTE_URL)?.valueString?.trim() || undefined,
    status: episode.status === "onhold" ? "paused" : episode.status,
    startDate: episode.period?.start?.trim() || "",
    endDate: episode.period?.end?.trim() || undefined,
    clinicalContext: readContext(episode),
    diagnosisReferences: readDiagnoses(episode),
    plannedFrequency: episode.extension?.find((entry) => entry.url === `${CONTEXT_BASE}episodeofcare-planned-frequency-v1`)?.valueString?.trim() || undefined,
    plannedSessionCount: episode.extension?.find((entry) => entry.url === `${CONTEXT_BASE}episodeofcare-planned-session-count-v1`)?.valuePositiveInt,
    precautions: (() => {
      const values = episode.extension?.filter((entry) => entry.url === `${CONTEXT_BASE}episodeofcare-precaution-v1`).map((entry) => entry.valueString?.trim()).filter((value): value is string => Boolean(value)) ?? [];
      return values.length ? values : undefined;
    })(),
    currentPeriodId: episode.extension?.find(e => e.url === `${CONTEXT_BASE}episodeofcare-current-period-v1`)?.valueString,
    metadataRevision: episode.extension?.find(e => e.url === `${CONTEXT_BASE}episodeofcare-metadata-revision-v1`)?.valueInteger ?? 0,
    version: episode.meta?.versionId?.trim() || undefined,
    statusHistory: (() => {
      const notes = episode.extension?.filter((entry) => entry.url === STATUS_CHANGE_URL).map((entry) => ({
        status: entry.extension?.find((part) => part.url === "status")?.valueCode,
        at: entry.extension?.find((part) => part.url === "at")?.valueDateTime,
        note: entry.extension?.find((part) => part.url === "note")?.valueString,
      })) ?? [];
      const values = (episode.statusHistory ?? []).flatMap((entry) => {
        const status = entry.status === "onhold" ? "paused" : entry.status;
        if (status !== "active" && status !== "paused" && status !== "finished") return [];
        const note = notes.find((item) => item.status === status && item.at === entry.period?.start)?.note;
        return [{ status: status as "active" | "paused" | "finished", startedAt: entry.period?.start, endedAt: entry.period?.end, note }];
      });
      return values.length ? values : undefined;
    })(),
  };
}
