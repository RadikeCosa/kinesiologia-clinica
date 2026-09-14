import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { createVisit } from "@/application/visits/create-visit";
import { getPatientContext } from "@/application/patients/get-patient-context";
import { createFhirClient } from "@/infrastructure/fhir/core/fhir.client";
import { createFhirPatientRepository } from "@/infrastructure/fhir/patient/fhir-patient.repository";
import { createFhirTreatmentRepository } from "@/infrastructure/fhir/episode-of-care/fhir-treatment.repository";
import { createFhirConditionRepository } from "@/infrastructure/fhir/condition/fhir-condition.repository";
import { createFhirVisitRepository } from "@/infrastructure/fhir/encounter/fhir-visit.repository";
import { createFhirMetricRepository } from "@/infrastructure/fhir/observation/fhir-metric.repository";

const SAFE_FHIR_DEV_URL = "http://localhost:8081/fhir";
const configuredUrl = process.env.FHIR_INTEGRATION_BASE_URL?.replace(/\/$/, "");
if (configuredUrl && configuredUrl !== SAFE_FHIR_DEV_URL) {
  throw new Error(`FHIR integration tests are only allowed against ${SAFE_FHIR_DEV_URL}.`);
}
const describeIntegration = configuredUrl ? describe : describe.skip;

describeIntegration("clinical visit FHIR contract", () => {
  const client = createFhirClient({ baseUrl: SAFE_FHIR_DEV_URL });
  const dependencies = {
    patients: createFhirPatientRepository(client),
    treatments: createFhirTreatmentRepository(client),
    conditions: createFhirConditionRepository(client),
    visits: createFhirVisitRepository(client),
    metrics: createFhirMetricRepository(client),
  };
  const patientId = "fixture-visit-patient";
  const treatmentId = "fixture-visit-treatment";
  const conditionId = "fixture-visit-condition";

  beforeAll(async () => {
    await client.put(`Patient/${patientId}`, {
      resourceType: "Patient", id: patientId,
      name: [{ family: "Ficticia", given: ["Persona"] }],
    });
    await client.put(`Condition/${conditionId}`, {
      resourceType: "Condition", id: conditionId,
      subject: { reference: `Patient/${patientId}` },
      code: { text: "Diagnóstico ficticio para prueba" },
    });
    await client.put(`EpisodeOfCare/${treatmentId}`, {
      resourceType: "EpisodeOfCare", id: treatmentId, status: "active",
      patient: { reference: `Patient/${patientId}` }, period: { start: "2026-09-14" },
      extension: [{
        url: "https://kinesiologiaadomicilio.local/fhir/StructureDefinition/episodeofcare-therapeutic-goals-v1",
        valueString: "Objetivo ficticio de prueba",
      }],
      diagnosis: [{
        condition: { reference: `Condition/${conditionId}` },
        role: { coding: [{ system: "https://kinesiologiaadomicilio.local/fhir/CodeSystem/episodeofcare-diagnosis-role-v1", code: "medical_reference" }] },
      }],
    });
  });

  it("reads treatment context and diagnosis without exposing FHIR resources", async () => {
    const context = await getPatientContext(patientId, dependencies);
    expect(context?.treatment.clinicalContext?.therapeuticGoals).toBe("Objetivo ficticio de prueba");
    expect(context?.diagnoses).toContainEqual(expect.objectContaining({
      kind: "medical_reference", text: "Diagnóstico ficticio para prueba",
    }));
  });

  it("writes, retries without duplication, and re-reads a complete visit and metric", async () => {
    const clientVisitId = randomUUID();
    const input = {
      clientVisitId, patientId, treatmentId,
      captureMode: "retrospective" as const,
      startedAt: "2026-09-14T14:00:00.000Z",
      endedAt: "2026-09-14T14:45:00.000Z",
      clinicalNote: {
        subjective: "Estado inicial ficticio",
        intervention: "Intervención ficticia",
        assessment: "Respuesta ficticia",
        nextPlan: "Continuidad ficticia",
      },
      metrics: [{ code: "pain_nrs_0_10" as const, value: 3 }],
    };
    const first = await createVisit(input, dependencies);
    const retry = await createVisit(input, dependencies);
    expect(retry.visit.id).toBe(first.visit.id);
    expect(retry.visit.clinicalNote?.assessment).toBe(input.clinicalNote.assessment);
    expect(retry.visit.captureMode).toBe("retrospective");
    expect(retry.metrics).toContainEqual(expect.objectContaining({ code: "pain_nrs_0_10", value: 3 }));
    const visits = await dependencies.visits.listByPatientId(patientId);
    expect(visits.filter((visit) => visit.id === first.visit.id)).toHaveLength(1);
    const metrics = await dependencies.metrics.listByVisitId(first.visit.id);
    expect(metrics.filter((metric) => metric.code === "pain_nrs_0_10")).toHaveLength(1);
  });
});
