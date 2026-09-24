import { describe, expect, it, vi } from "vitest";
import type { ClinicalEvaluation, ClinicalSymptom, PerformedProcedure } from "@/domain/visit/clinical-entry";
import type { FunctionalMetric, Visit } from "@/domain/visit/visit";
import type { ScheduledVisit } from "@/domain/schedule/scheduled-visit";
import { annulFinishedVisit, correctFinishedVisit } from "./correct-visit";

const patientId = "patient-fictional";
const visitId = "visit-fictional";
const clientId = "11111111-1111-4111-8111-111111111111";
const seriesId = "22222222-2222-4222-8222-222222222222";
const start = "2026-09-15T13:00:00.000Z";
const end = "2026-09-15T14:00:00.000Z";
const note = { statusAndResponse: "Respuesta ficticia", intervention: "Intervención ficticia" };

function setup() {
  let visit: Visit = { id: visitId, patientId, treatmentId: "treatment-fictional", status: "finished", startedAt: start, endedAt: end, appointmentId: "appointment-fictional", clinicalNote: note, version: "1" };
  let appointment: ScheduledVisit = { id: "appointment-fictional", patientId, treatmentId: "treatment-fictional", status: "fulfilled", scheduledDate: "2026-09-15", startsAt: start, endsAt: end, createdAt: start, version: "1" };
  let evaluations: ClinicalEvaluation[] = [{ id: `evaluation-${clientId}`, clientId, seriesId, patientId, visitId, effectiveDateTime: start, domain: "strength", name: "Fuerza ficticia", result: { kind: "coded", value: "Limitada" }, status: "final", version: "1" }];
  let symptoms: ClinicalSymptom[] = [{ id: "symptom-11111111-1111-4111-8111-111111111111", clientId: "11111111-1111-4111-8111-111111111111", seriesId, code: "pain", severity: 4, patientId, visitId, effectiveDateTime: start, status: "final", version: "1" }];
  let procedures: PerformedProcedure[] = [{ id: "proc-fictional-exercise", patientId, visitId, family: "therapeutic-exercise", performedStart: start, performedEnd: end, status: "completed", version: "1" }];
  let metrics: FunctionalMetric[] = [];
  const workflow = {
    correct: vi.fn(async (next: Visit, nextMetrics: FunctionalMetric[], nextEvaluations: ClinicalEvaluation[], nextProcedures: PerformedProcedure[], nextSymptoms: ClinicalSymptom[] = []) => {
      visit = { ...next, version: "2" };
      metrics = nextMetrics;
      evaluations = nextEvaluations.filter((item) => item.status !== "entered-in-error");
      symptoms = nextSymptoms.filter((item) => item.status !== "entered-in-error");
      procedures = nextProcedures.filter((item) => item.status !== "entered-in-error");
    }),
    annulFinished: vi.fn(async (next: Visit, _metrics: FunctionalMetric[], _evaluations: ClinicalEvaluation[], _procedures: PerformedProcedure[], nextAppointment?: ScheduledVisit, nextSymptoms: ClinicalSymptom[] = []) => {
      visit = { ...next, version: "2" };
      if (nextAppointment) appointment = nextAppointment;
      evaluations = []; symptoms = nextSymptoms.filter((item) => item.status !== "entered-in-error"); procedures = [];
    }),
  };
  const dependencies = {
    clock: { now: () => new Date("2026-09-16T12:00:00.000Z") },
    visits: { getById: vi.fn(async () => visit), listByPatientId: vi.fn(), listInProgress: vi.fn(), put: vi.fn() },
    metrics: { listByVisitId: vi.fn(async () => metrics), putIfAbsent: vi.fn() },
    evaluations: { listByVisitId: vi.fn(async () => evaluations), listByPatientId: vi.fn(), putIfAbsent: vi.fn() },
    symptoms: { listByVisitId: vi.fn(async () => symptoms), listByPatientId: vi.fn(), putIfAbsent: vi.fn() },
    procedures: { listByVisitId: vi.fn(async () => procedures), putIfAbsent: vi.fn() },
    scheduledVisits: { getById: vi.fn(async () => appointment), listByPatientId: vi.fn(), listOpen: vi.fn(), listBetween: vi.fn(), listChangedBetween: vi.fn(), putIfAbsent: vi.fn(), replace: vi.fn(), close: vi.fn() },
    workflow,
  };
  return { dependencies, workflow, getVisit: () => visit, getAppointment: () => appointment };
}

const correction = { patientId, visitId, expectedVersion: "1", startedAt: start, endedAt: end, reason: "Se corrigió el resultado de fuerza.", clinicalNote: note,
  clinicalEntries: { evaluations: [{ clientId, seriesId, domain: "strength" as const, name: "Fuerza ficticia", result: { kind: "coded" as const, value: "Conservada" } }], symptoms: [{ clientId: "11111111-1111-4111-8111-111111111111", seriesId, code: "pain" as const, severity: 4 }], procedures: [{ family: "therapeutic-exercise" as const }] } };

describe("confirmed visit corrections", () => {
  it("updates the same encounter and evaluation in one workflow operation", async () => {
    const { dependencies, workflow } = setup();
    const result = await correctFinishedVisit(correction, dependencies);
    expect(result.id).toBe(visitId);
    expect(result.correctionReason).toBe(correction.reason);
    expect(workflow.correct).toHaveBeenCalledOnce();
    expect(workflow.correct.mock.calls[0]?.[2]).toContainEqual(expect.objectContaining({ id: `evaluation-${clientId}`, status: "corrected", version: "1", result: { kind: "coded", value: "Conservada" } }));
    expect((await correctFinishedVisit(correction, dependencies)).id).toBe(visitId);
    expect(workflow.correct).toHaveBeenCalledOnce();
  });

  it("retires an evaluation removed during correction", async () => {
    const { dependencies, workflow } = setup();
    await correctFinishedVisit({ ...correction, clinicalEntries: { evaluations: [], symptoms: [], procedures: [] } }, dependencies);
    expect(workflow.correct.mock.calls[0]?.[2]).toContainEqual(expect.objectContaining({ id: `evaluation-${clientId}`, status: "entered-in-error" }));
    expect(workflow.correct.mock.calls[0]?.[3]).toContainEqual(expect.objectContaining({ family: "therapeutic-exercise", status: "entered-in-error" }));
    expect(workflow.correct.mock.calls[0]?.[4]).toContainEqual(expect.objectContaining({ code: "pain", status: "entered-in-error" }));
  });

  it("rejects stale versions before writing", async () => {
    const { dependencies, workflow } = setup();
    await expect(correctFinishedVisit({ ...correction, expectedVersion: "0" }, dependencies)).rejects.toThrow("Recargá");
    expect(workflow.correct).not.toHaveBeenCalled();
  });

  it("annuls the encounter and its entries and restores the scheduled visit", async () => {
    const { dependencies, workflow, getVisit, getAppointment } = setup();
    await annulFinishedVisit({ patientId, visitId, expectedVersion: "1", reason: "Se registró la visita equivocada." }, dependencies);
    expect(getVisit().status).toBe("entered-in-error");
    expect(getAppointment().status).toBe("booked");
    expect(workflow.annulFinished.mock.calls[0]?.[2]).toContainEqual(expect.objectContaining({ status: "entered-in-error" }));
  });
});
