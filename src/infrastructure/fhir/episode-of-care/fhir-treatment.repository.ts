import type { TreatmentRepository } from "@/application/treatments/treatment.repository";
import { readAllResourcesByType } from "@/infrastructure/fhir/core/fhir.bundle";
import type { FhirClient } from "@/infrastructure/fhir/core/fhir.client";
import { buildActiveTreatmentsSearch } from "@/infrastructure/fhir/core/fhir.search";
import type { FhirEpisodeOfCare } from "./episode-of-care.fhir";
import { mapFhirEpisodeOfCare } from "./episode-of-care.mapper";
import { FhirClientError } from "@/infrastructure/fhir/core/fhir.errors";

export function createFhirTreatmentRepository(
  client: FhirClient,
): TreatmentRepository {
  return {
    async getById(id) {
      if (!/^[A-Za-z0-9.-]{1,64}$/.test(id)) return null;
      try {
        const episode = await client.get<FhirEpisodeOfCare>(`EpisodeOfCare/${id}`);
        return mapFhirEpisodeOfCare(episode);
      } catch (error) {
        if (error instanceof FhirClientError && error.status === 404) return null;
        throw error;
      }
    },
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
