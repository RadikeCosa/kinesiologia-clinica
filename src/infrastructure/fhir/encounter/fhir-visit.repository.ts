import type { VisitRepository } from "@/application/visits/visit.repository";
import { readAllResourcesByType } from "@/infrastructure/fhir/core/fhir.bundle";
import type { FhirClient } from "@/infrastructure/fhir/core/fhir.client";
import { FhirClientError } from "@/infrastructure/fhir/core/fhir.errors";
import { mapFhirEncounter, mapVisitToFhir, type FhirEncounter } from "./encounter.mapper";

export function createFhirVisitRepository(client: FhirClient): VisitRepository {
  return {
    async getById(id) {
      if (!/^[A-Za-z0-9.-]{1,64}$/.test(id)) return null;
      try {
        return mapFhirEncounter(await client.get<FhirEncounter>(`Encounter/${id}`));
      } catch (error) {
        if (error instanceof FhirClientError && error.status === 404) return null;
        throw error;
      }
    },
    async listByPatientId(patientId) {
      if (!/^[A-Za-z0-9.-]{1,64}$/.test(patientId)) return [];
      const query = new URLSearchParams({ subject: `Patient/${patientId}`, _sort: "-date", _count: "100" });
      const resources = await readAllResourcesByType<FhirEncounter>({
        client, path: `Encounter?${query}`, resourceType: "Encounter",
      });
      return resources.map(mapFhirEncounter).filter((visit) => visit.patientId === patientId && visit.id);
    },
    async put(visit) {
      await client.put<FhirEncounter>(`Encounter/${visit.id}`, mapVisitToFhir(visit));
    },
  };
}
