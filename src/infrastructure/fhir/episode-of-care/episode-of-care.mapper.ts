import type { Treatment } from "@/domain/treatment/treatment";
import { extractIdFromReference } from "@/infrastructure/fhir/core/fhir.references";
import type { FhirEpisodeOfCare } from "./episode-of-care.fhir";

const CONTEXT_BASE = "https://kinesiologiaadomicilio.local/fhir/StructureDefinition/";
const DIAGNOSIS_ROLE_SYSTEM = "https://kinesiologiaadomicilio.local/fhir/CodeSystem/episodeofcare-diagnosis-role-v1";

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
  };
}
