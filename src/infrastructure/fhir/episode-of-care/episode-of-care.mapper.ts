import type { Treatment } from "@/domain/treatment/treatment";
import { extractIdFromReference } from "@/infrastructure/fhir/core/fhir.references";
import type { FhirEpisodeOfCare } from "./episode-of-care.fhir";

export function mapFhirEpisodeOfCare(
  episode: FhirEpisodeOfCare,
): Treatment {
  return {
    id: episode.id?.trim() || "",
    patientId: extractIdFromReference(episode.patient?.reference) || "",
    status: episode.status,
    startDate: episode.period?.start?.trim() || "",
    endDate: episode.period?.end?.trim() || undefined,
  };
}
