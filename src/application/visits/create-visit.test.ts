import { describe, expect, it, vi } from "vitest";
import { createVisit, VisitConflictError } from "./create-visit";
import type { FunctionalMetric, Visit } from "@/domain/visit/visit";
import type { ClinicalEvaluation, ClinicalSymptom, PerformedProcedure } from "@/domain/visit/clinical-entry";

const input = {
  clientVisitId: "cd1ee5a0-2f2e-4fca-876b-23dba8261e7e",
  patientId: "fixture-patient",
  treatmentId: "fixture-treatment",
  captureMode: "retrospective" as const,
  startedAt: "2026-09-14T14:00:00.000Z",
  endedAt: "2026-09-14T14:45:00.000Z",
  clinicalNote: {
    statusAndResponse: "Estado y respuesta ficticios",
    intervention: "Intervención ficticia",
  },
  metrics: [],
};

function dependencies(existing: Visit | null = null) {
  let saved = existing;
  const put = vi.fn(async (visit: Visit) => { saved = visit; });
  const evaluations: ClinicalEvaluation[] = [];
  const symptoms: ClinicalSymptom[] = [];
  const procedures: PerformedProcedure[] = [];
  const workflow = { start: vi.fn(), annul: vi.fn(), finish: vi.fn(), completeRetrospective: vi.fn(async (visit: Visit, _metrics: FunctionalMetric[], savedEvaluations: ClinicalEvaluation[], savedProcedures: PerformedProcedure[], _appointment?: unknown, savedSymptoms: ClinicalSymptom[] = []) => { saved = visit; evaluations.push(...savedEvaluations); symptoms.push(...savedSymptoms); procedures.push(...savedProcedures); }) };
  return {
    patients: { getById: vi.fn(async () => ({ id: input.patientId, givenName: "Persona", familyName: "Ficticia" })), listByIds: vi.fn(async () => []) },
    treatments: { getById: vi.fn(async () => ({ id: input.treatmentId, patientId: input.patientId, status: "active" as const, startDate: "2026-09-14" })), listActive: vi.fn(async () => []) },
    visits: { getById: vi.fn(async () => saved), listByPatientId: vi.fn(async () => []), put },
    metrics: { listByVisitId: vi.fn(async () => []), putIfAbsent: vi.fn(async () => { }) },
    evaluations: { listByVisitId: vi.fn(async () => evaluations), listByPatientId: vi.fn(async () => evaluations), putIfAbsent: vi.fn(async (value: ClinicalEvaluation) => { evaluations.push(value); }) },
    symptoms: { listByVisitId: vi.fn(async () => symptoms), listByPatientId: vi.fn(async () => symptoms), putIfAbsent: vi.fn(async (value: ClinicalSymptom) => { symptoms.push(value); }) },
    procedures: { listByVisitId: vi.fn(async () => procedures), putIfAbsent: vi.fn(async (value: PerformedProcedure) => { procedures.push(value); }) },
    workflow,
  };
}

describe("createVisit", () => {
  it("keeps a stable visit identity across retries and rejects changed content", async () => {
    const ports = dependencies();
    const first = await createVisit(input, ports);
    const retry = await createVisit(input, ports);
    expect(first.visit.id).toBe(`visit-${input.clientVisitId}`);
    expect(retry.visit.id).toBe(first.visit.id);
    expect(ports.workflow.completeRetrospective).toHaveBeenCalledTimes(1);
    await expect(createVisit({ ...input, clinicalNote: { ...input.clinicalNote, statusAndResponse: "Otra respuesta ficticia" } }, ports)).rejects.toBeInstanceOf(VisitConflictError);
  });

  it("rejects reuse of an evaluation identity with different content", async () => {
    const ports = dependencies();
    const symptom = { clientId: "11111111-1111-4111-8111-111111111111", seriesId: "22222222-2222-4222-8222-222222222222", code: "pain" as const, severity: 3 };
    const withEntries = { ...input, clinicalEntries: { evaluations: [], symptoms: [symptom], procedures: [{ family: "manual-therapy" as const }] } };
    await createVisit(withEntries, ports);
    await expect(createVisit({ ...withEntries, clinicalEntries: { ...withEntries.clinicalEntries, symptoms: [{ ...symptom, severity: 8 }] } }, ports)).rejects.toBeInstanceOf(VisitConflictError);
  });

  it("persists clinical entries when the legacy workflow port is unavailable", async () => {
    const ports = dependencies();
    const evaluation = { clientId: "11111111-1111-4111-8111-111111111111", seriesId: "22222222-2222-4222-8222-222222222222", domain: "strength" as const, name: "Evaluación ficticia", result: { kind: "quantity" as const, value: 3, unit: "repeticiones" } };
    const procedures = ports.procedures;
    const withEntries = { ...input, clinicalEntries: { evaluations: [evaluation], procedures: [{ family: "manual-therapy" as const }] } };
    const legacyPorts = { ...ports, workflow: undefined };
    await createVisit(withEntries, legacyPorts);
    expect(ports.evaluations.putIfAbsent).toHaveBeenCalledTimes(1);
    expect(procedures.putIfAbsent).toHaveBeenCalledTimes(1);
  });

  it("does not write when the treatment belongs to another patient", async () => {
    const ports = dependencies();
    ports.treatments.getById.mockResolvedValue({ id: input.treatmentId, patientId: "other-patient", status: "active", startDate: "2026-09-14" });
    await expect(createVisit(input, ports)).rejects.toThrow("tratamiento no está disponible");
    expect(ports.visits.put).not.toHaveBeenCalled();
  });
});
