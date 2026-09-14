import type { PatientRepository } from "@/application/patients/patient.repository";
import { readAllResourcesByType } from "@/infrastructure/fhir/core/fhir.bundle";
import type { FhirClient } from "@/infrastructure/fhir/core/fhir.client";
import { buildPatientsByIdsSearch } from "@/infrastructure/fhir/core/fhir.search";
import type { FhirPatient } from "./patient.fhir";
import { mapFhirPatient } from "./patient.mapper";
import { FhirClientError } from "@/infrastructure/fhir/core/fhir.errors";

export function createFhirPatientRepository(
  client: FhirClient,
): PatientRepository {
  return {
    async getById(id) {
      if (!/^[A-Za-z0-9.-]{1,64}$/.test(id)) return null;
      try {
        const patient = await client.get<FhirPatient>(`Patient/${id}`);
        return mapFhirPatient(patient);
      } catch (error) {
        if (error instanceof FhirClientError && error.status === 404) return null;
        throw error;
      }
    },
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
