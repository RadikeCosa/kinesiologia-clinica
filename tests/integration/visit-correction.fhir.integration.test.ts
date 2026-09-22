import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createVisit } from "@/application/visits/create-visit";
import { annulFinishedVisit, correctFinishedVisit } from "@/application/visits/correct-visit";
import { createFhirClient } from "@/infrastructure/fhir/core/fhir.client";
import { createFhirPatientRepository } from "@/infrastructure/fhir/patient/fhir-patient.repository";
import { createFhirTreatmentRepository } from "@/infrastructure/fhir/episode-of-care/fhir-treatment.repository";
import { createFhirVisitRepository } from "@/infrastructure/fhir/encounter/fhir-visit.repository";
import { createFhirMetricRepository } from "@/infrastructure/fhir/observation/fhir-metric.repository";
import { createFhirClinicalEvaluationRepository } from "@/infrastructure/fhir/observation/fhir-clinical-evaluation.repository";
import { createFhirPerformedProcedureRepository } from "@/infrastructure/fhir/procedure/fhir-performed-procedure.repository";
import { createFhirScheduledVisitRepository } from "@/infrastructure/fhir/appointment/fhir-scheduled-visit.repository";
import { createFhirClinicalWorkflowRepository } from "@/infrastructure/fhir/encounter/fhir-clinical-workflow.repository";

const BASE = "http://localhost:8081/fhir";
const configuredUrl = process.env.FHIR_INTEGRATION_BASE_URL?.replace(/\/$/, "");
if (configuredUrl && configuredUrl !== BASE) throw new Error(`FHIR integration tests are only allowed against ${BASE}.`);
const describeIntegration = configuredUrl ? describe : describe.skip;

describeIntegration("visit correction and annulment on fictional HAPI data", () => {
  const token = randomUUID().slice(0, 8);
  const patientId = `fixture-correction-patient-${token}`;
  const treatmentId = `fixture-correction-treatment-${token}`;
  const clientVisitId = randomUUID();
  const evaluationId = randomUUID();
  const seriesId = randomUUID();
  const client = createFhirClient({ baseUrl: BASE });
  const dependencies = {
    patients: createFhirPatientRepository(client), treatments: createFhirTreatmentRepository(client),
    visits: createFhirVisitRepository(client), metrics: createFhirMetricRepository(client),
    evaluations: createFhirClinicalEvaluationRepository(client), procedures: createFhirPerformedProcedureRepository(client),
    scheduledVisits: createFhirScheduledVisitRepository(client), workflow: createFhirClinicalWorkflowRepository(client),
  };
  const visitId = `visit-${clientVisitId}`;

  beforeAll(async () => {
    await client.put(`Patient/${patientId}`, { resourceType: "Patient", id: patientId, name: [{ family: "Ficticia", given: ["Persona"] }] });
    await client.put(`EpisodeOfCare/${treatmentId}`, { resourceType: "EpisodeOfCare", id: treatmentId, status: "active", patient: { reference: `Patient/${patientId}` }, period: { start: "2026-09-14" } });
  });

  afterAll(async () => {
    for (const path of [`Observation/evaluation-${evaluationId}`, `Procedure/proc-${clientVisitId}-exercise`, `Encounter/${visitId}`, `EpisodeOfCare/${treatmentId}`, `Patient/${patientId}`]) {
      await fetch(`${BASE}/${path}`, { method: "DELETE" }).catch(() => undefined);
    }
  });

  it("corrects the same visit and then annuls it without active evaluations", async () => {
    const created = await createVisit({
      clientVisitId, patientId, treatmentId, captureMode: "retrospective",
      startedAt: "2026-09-14T14:00:00.000Z", endedAt: "2026-09-14T14:45:00.000Z",
      clinicalNote: { statusAndResponse: "Estado ficticio inicial", intervention: "Ejercicio ficticio" }, metrics: [],
      clinicalEntries: { evaluations: [{ clientId: evaluationId, seriesId, domain: "strength", name: "Fuerza ficticia", result: { kind: "coded", value: "Limitada" } }], procedures: [{ family: "therapeutic-exercise" }] },
    }, dependencies);
    const correction = {
      patientId, visitId, expectedVersion: created.visit.version, reason: "Se corrigió el resultado ficticio.",
      startedAt: created.visit.startedAt, endedAt: created.visit.endedAt,
      clinicalNote: { statusAndResponse: "Estado ficticio corregido", intervention: "Ejercicio ficticio" },
      clinicalEntries: { evaluations: [{ clientId: evaluationId, seriesId, domain: "strength", name: "Fuerza ficticia", result: { kind: "coded", value: "Conservada" } }], procedures: [] },
    } as const;
    const corrected = await correctFinishedVisit(correction, dependencies);
    expect(corrected.clinicalNote?.statusAndResponse).toBe("Estado ficticio corregido");
    expect((await correctFinishedVisit(correction, dependencies)).version).toBe(corrected.version);
    expect(await dependencies.evaluations.listByVisitId(visitId)).toContainEqual(expect.objectContaining({ id: `evaluation-${evaluationId}`, result: { kind: "coded", value: "Conservada" } }));
    expect(await dependencies.procedures.listByVisitId(visitId)).toHaveLength(0);
    const annulled = await annulFinishedVisit({ patientId, visitId, expectedVersion: corrected.version, reason: "La visita ficticia se registró por error." }, dependencies);
    expect(annulled.status).toBe("entered-in-error");
    expect(await dependencies.evaluations.listByVisitId(visitId)).toHaveLength(0);
    expect(await dependencies.procedures.listByVisitId(visitId)).toHaveLength(0);
  });
});
