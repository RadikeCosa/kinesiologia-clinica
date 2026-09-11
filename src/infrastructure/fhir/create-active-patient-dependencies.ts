import "server-only";

import type { PatientRepository } from "@/application/patients/patient.repository";
import type { TreatmentRepository } from "@/application/treatments/treatment.repository";
import { createFhirClient } from "./core/fhir.client";
import { createFhirTreatmentRepository } from "./episode-of-care/fhir-treatment.repository";
import { readFhirConfig } from "./fhir.config";
import { createFhirPatientRepository } from "./patient/fhir-patient.repository";

export interface ActivePatientDependencies {
  patients: PatientRepository;
  treatments: TreatmentRepository;
}

export function createActivePatientDependencies(): ActivePatientDependencies {
  const config = readFhirConfig();

  if (!config) {
    throw new Error("La integración clínica no está configurada correctamente.");
  }

  const client = createFhirClient({ baseUrl: config.baseUrl });

  return {
    patients: createFhirPatientRepository(client),
    treatments: createFhirTreatmentRepository(client),
  };
}
