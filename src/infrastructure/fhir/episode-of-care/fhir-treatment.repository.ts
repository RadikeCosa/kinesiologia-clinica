import type { TreatmentRepository } from "@/application/treatments/treatment.repository";
import { readAllResourcesByType } from "@/infrastructure/fhir/core/fhir.bundle";
import type { FhirClient } from "@/infrastructure/fhir/core/fhir.client";
import { buildActiveTreatmentsSearch } from "@/infrastructure/fhir/core/fhir.search";
import type { FhirEpisodeOfCare } from "./episode-of-care.fhir";
import { mapFhirEpisodeOfCare } from "./episode-of-care.mapper";

export function createFhirTreatmentRepository(
  client: FhirClient,
): TreatmentRepository {
  return {
    async listActive() {
      const episodes = await readAllResourcesByType<FhirEpisodeOfCare>({
        client,
        path: buildActiveTreatmentsSearch(),
        resourceType: "EpisodeOfCare",
      });

      return episodes
        .map(mapFhirEpisodeOfCare)
        .filter(
          (treatment) =>
            treatment.id && treatment.patientId && treatment.status === "active",
        );
    },
  };
}
