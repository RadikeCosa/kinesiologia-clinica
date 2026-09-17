import type { ClinicalEvaluationRepository } from "@/application/visits/clinical-entry.repository";
import { readAllResourcesByType } from "@/infrastructure/fhir/core/fhir.bundle";
import type { FhirClient } from "@/infrastructure/fhir/core/fhir.client";
import { mapClinicalEvaluationToFhir, mapFhirClinicalEvaluation, type FhirClinicalObservation } from "./clinical-evaluation.mapper";

export function createFhirClinicalEvaluationRepository(client: FhirClient): ClinicalEvaluationRepository {
  async function list(parameter: "encounter" | "subject", reference: string) {
    const query = new URLSearchParams({ [parameter]: reference, _count: "200" });
    const resources = await readAllResourcesByType<FhirClinicalObservation>({ client, path: `Observation?${query}`, resourceType: "Observation" });
    return resources.flatMap((item) => mapFhirClinicalEvaluation(item) ?? []);
  }
  return {
    listByVisitId: async (id) => list("encounter", `Encounter/${id}`),
    listByPatientId: async (id) => list("subject", `Patient/${id}`),
    async putIfAbsent(evaluation) {
      await client.put<FhirClinicalObservation>(`Observation/${evaluation.id}`, mapClinicalEvaluationToFhir(evaluation));
    },
  };
}
