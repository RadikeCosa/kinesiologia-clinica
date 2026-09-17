import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { listActivePatients } from "@/application/patients/list-active-patients";
import { createFhirClient } from "@/infrastructure/fhir/core/fhir.client";
import { createFhirTreatmentRepository } from "@/infrastructure/fhir/episode-of-care/fhir-treatment.repository";
import type { FhirEpisodeOfCare } from "@/infrastructure/fhir/episode-of-care/episode-of-care.fhir";
import { createFhirPatientRepository } from "@/infrastructure/fhir/patient/fhir-patient.repository";
import type { FhirPatient } from "@/infrastructure/fhir/patient/patient.fhir";

const SAFE_FHIR_DEV_URL = "http://localhost:8081/fhir";
const configuredUrl = process.env.FHIR_INTEGRATION_BASE_URL?.replace(/\/$/, "");

if (configuredUrl && configuredUrl !== SAFE_FHIR_DEV_URL) {
  throw new Error(
    `FHIR integration tests are only allowed against ${SAFE_FHIR_DEV_URL}.`,
  );
}

const describeIntegration = configuredUrl ? describe : describe.skip;

describeIntegration("active patients FHIR contract", () => {
  const client = createFhirClient({ baseUrl: SAFE_FHIR_DEV_URL });
  const patientId = "fixture-active-patient";
  const treatmentId = "fixture-active-treatment";

  beforeAll(async () => {
    await client.put<FhirPatient>(`Patient/${patientId}`, {
      resourceType: "Patient",
      id: patientId,
      name: [{ family: "Prueba", given: ["Paciente"] }],
      telecom: [{ system: "phone", value: "+54 299 555 0199" }],
    });
    await client.put<FhirEpisodeOfCare>(`EpisodeOfCare/${treatmentId}`, {
      resourceType: "EpisodeOfCare",
      id: treatmentId,
      status: "active",
      patient: { reference: `Patient/${patientId}` },
      period: { start: "2026-09-11" },
    });
  });

  afterAll(async () => {
    await fetch(`${SAFE_FHIR_DEV_URL}/EpisodeOfCare/${treatmentId}`, { method: "DELETE" });
    await fetch(`${SAFE_FHIR_DEV_URL}/Patient/${patientId}`, { method: "DELETE" });
  });

  it("writes fixtures through HAPI and reads the active patient use case", async () => {
    const result = await listActivePatients({
      patients: createFhirPatientRepository(client),
      treatments: createFhirTreatmentRepository(client),
    });

    expect(result).toContainEqual({
      id: patientId,
      displayName: "Paciente Prueba",
      phone: "+54 299 555 0199",
      treatment: {
        id: treatmentId,
        startDate: "2026-09-11",
      },
      dataQuality: {
        multipleActiveTreatments: false,
      },
    });
  });
});
