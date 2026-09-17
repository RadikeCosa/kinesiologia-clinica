import type { PerformedProcedureRepository } from "@/application/visits/clinical-entry.repository";
import { readAllResourcesByType } from "@/infrastructure/fhir/core/fhir.bundle";
import type { FhirClient } from "@/infrastructure/fhir/core/fhir.client";
import { mapFhirPerformedProcedure, mapPerformedProcedureToFhir, type FhirProcedure } from "./procedure.mapper";

export function createFhirPerformedProcedureRepository(client: FhirClient): PerformedProcedureRepository {
  return {
    async listByVisitId(id) {
      const query = new URLSearchParams({ encounter: `Encounter/${id}`, _count: "100" });
      const resources = await readAllResourcesByType<FhirProcedure>({ client, path: `Procedure?${query}`, resourceType: "Procedure" });
      return resources.flatMap((item) => mapFhirPerformedProcedure(item) ?? []);
    }, async putIfAbsent(procedure) {
      await client.put<FhirProcedure>(`Procedure/${procedure.id}`, mapPerformedProcedureToFhir(procedure));
    }
  };
}
