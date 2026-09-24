import type { ClinicalSymptomRepository } from "@/application/visits/clinical-entry.repository";
import { readAllResourcesByType } from "@/infrastructure/fhir/core/fhir.bundle";
import type { FhirClient } from "@/infrastructure/fhir/core/fhir.client";
import { mapClinicalSymptomToFhir, mapFhirClinicalSymptom } from "./clinical-symptom.mapper";
import type { FhirClinicalObservation } from "./clinical-evaluation.mapper";

export function createFhirClinicalSymptomRepository(client: FhirClient): ClinicalSymptomRepository {
  async function list(parameter: "encounter" | "subject", reference: string) {
    const query = new URLSearchParams({ [parameter]: reference, _count: "200" });
    const resources = await readAllResourcesByType<FhirClinicalObservation>({ client, path: `Observation?${query}`, resourceType: "Observation" });
    return resources.filter((item) => item.status !== "entered-in-error").flatMap((item) => mapFhirClinicalSymptom(item) ?? []);
  }
  return {
    listByVisitId: async (id) => list("encounter", `Encounter/${id}`),
    listByPatientId: async (id) => list("subject", `Patient/${id}`),
    async putIfAbsent(symptom) {
      await client.put<FhirClinicalObservation>(`Observation/${symptom.id}`, mapClinicalSymptomToFhir(symptom));
    },
  };
}
