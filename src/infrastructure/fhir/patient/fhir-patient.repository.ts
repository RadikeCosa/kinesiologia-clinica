import type { PatientRepository } from "@/application/patients/patient.repository";
import { readAllResourcesByType } from "@/infrastructure/fhir/core/fhir.bundle";
import type { FhirClient } from "@/infrastructure/fhir/core/fhir.client";
import { buildPatientsByIdsSearch } from "@/infrastructure/fhir/core/fhir.search";
import type { FhirPatient } from "./patient.fhir";
import { mapFhirPatient } from "./patient.mapper";

export function createFhirPatientRepository(
  client: FhirClient,
): PatientRepository {
  return {
    async listByIds(ids) {
      const path = buildPatientsByIdsSearch(ids);
      if (!path) return [];

      const patients = await readAllResourcesByType<FhirPatient>({
        client,
        path,
        resourceType: "Patient",
      });

      return patients.map(mapFhirPatient).filter((patient) => patient.id);
    },
  };
}
