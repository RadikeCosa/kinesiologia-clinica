import { describe, expect, it, vi } from "vitest";
import { ActiveVisitError, annulVisitStart, finishVisit, startVisit } from "./manage-visit-workflow";
import type { Visit } from "@/domain/visit/visit";
import type { ScheduledVisit } from "@/domain/schedule/scheduled-visit";
import type { ClinicalEvaluation, PerformedProcedure } from "@/domain/visit/clinical-entry";

const patient = { id: "patient-fixture", givenName: "Rosa", familyName: "Ficticia" };
const treatment = { id: "treatment-fixture", patientId: patient.id, status: "active" as const, startDate: "2026-09-01" };
const appointment: ScheduledVisit = {
  id: "appointment-b73e87c5-76e4-4c75-82e2-507b91d1288a", patientId: patient.id, treatmentId: treatment.id,
  status: "booked", scheduledDate: "2026-09-15", startsAt: "2026-09-15T13:00:00.000Z", endsAt: "2026-09-15T14:00:00.000Z", durationMinutes: 60,
  createdAt: "2026-09-14T12:00:00.000Z", version: "1",
};

function setup(initialVisits: Visit[] = [], appointmentState: ScheduledVisit = appointment) {
  const visits = new Map(initialVisits.map((item) => [item.id, item]));
  const metrics: Array<{ id: string; patientId: string; visitId: string; code: "pain_nrs_0_10"; value: number; effectiveDateTime: string; unit: string }> = [];
  const workflow = {
    start: vi.fn(async (visit: Visit, appointmentInput?: ScheduledVisit) => { void appointmentInput; visits.set(visit.id, { ...visit, version: "1" }); }),
    annul: vi.fn(async (visit: Visit, appointmentInput?: ScheduledVisit) => { void appointmentInput; visits.set(visit.id, { ...visit, version: "2" }); }),
    finish: vi.fn(async (visit: Visit, savedMetrics: typeof metrics, evaluations: ClinicalEvaluation[] = [], procedures: PerformedProcedure[] = []) => { void evaluations; void procedures; visits.set(visit.id, { ...visit, version: "2" }); metrics.push(...savedMetrics); }),
    completeRetrospective: vi.fn(),
  };
  return {
    visits, workflow,
    dependencies: {
      clock: { now: () => new Date("2026-09-15T13:10:00.000Z") },
      patients: { getById: vi.fn(async () => patient), listByIds: vi.fn(async () => [patient]) },
      treatments: { getById: vi.fn(async () => treatment), listActive: vi.fn(async () => [treatment]), listDirectory: vi.fn(async () => [treatment]) },
      visits: { getById: vi.fn(async (id: string) => visits.get(id) ?? null), listByPatientId: vi.fn(async () => [...visits.values()]), listInProgress: vi.fn(async () => [...visits.values()].filter((item) => item.status === "in-progress")), put: vi.fn() },
      metrics: { listByVisitId: vi.fn(async (id: string) => metrics.filter((item) => item.visitId === id)), putIfAbsent: vi.fn() },
      scheduledVisits: { getById: vi.fn(async () => appointmentState), listByPatientId: vi.fn(), listOpen: vi.fn(), listBetween: vi.fn(), listChangedBetween: vi.fn(), putIfAbsent: vi.fn(), replace: vi.fn(), close: vi.fn() },
      workflow,
    },
  };
}

const startInput = { clientVisitId: "e07cfd2d-5e26-46dc-84a2-e524587eb814", patientId: patient.id, treatmentId: treatment.id, appointmentId: appointment.id };
const note = { statusAndResponse: "Evolución y respuesta ficticias", intervention: "Movilidad ficticia" };

describe("visit workflow use cases", () => {
  it("starts appointment and encounter atomically and retries without duplicates", async () => {
    const { dependencies, workflow } = setup();
    const first = await startVisit(startInput, dependencies);
    const retry = await startVisit(startInput, dependencies);
    expect(first.id).toBe("visit-b73e87c5-76e4-4c75-82e2-507b91d1288a");
    expect(retry.id).toBe(first.id);
    expect(workflow.start).toHaveBeenCalledTimes(1);
    expect(workflow.start.mock.calls[0]?.[1]).toMatchObject({ status: "fulfilled" });
  });

  it("prevents a second simultaneous visit", async () => {
    const active: Visit = { id: "visit-other", patientId: "other", treatmentId: "other", status: "in-progress", startedAt: "2026-09-15T12:00:00.000Z", captureMode: "live", version: "1" };
    const { dependencies } = setup([active]);
    await expect(startVisit(startInput, dependencies)).rejects.toBeInstanceOf(ActiveVisitError);
  });

  it("serializes concurrent starts before checking the active visit", async () => {
    const { dependencies } = setup();
    const secondInput = { ...startInput, clientVisitId: "e07cfd2d-5e26-46dc-84a2-e524587eb815", appointmentId: undefined };
    const results = await Promise.allSettled([startVisit(startInput, dependencies), startVisit(secondInput, dependencies)]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected" && result.reason instanceof ActiveVisitError)).toHaveLength(1);
  });

  it("starts an untimed appointment without inventing an agreed time", async () => {
    const untimed = { ...appointment, status: "proposed" as const, startsAt: undefined, endsAt: undefined, durationMinutes: undefined };
    const { dependencies, workflow } = setup([], untimed);
    await startVisit(startInput, dependencies);
    expect(workflow.start.mock.calls[0]?.[1]).toMatchObject({ status: "fulfilled", startsAt: undefined });
  });

  it("finishes once with deterministic metrics and confirms a repeated response", async () => {
    const active: Visit = { id: "visit-active", patientId: patient.id, treatmentId: treatment.id, status: "in-progress", startedAt: "2026-09-15T13:00:00.000Z", captureMode: "live", version: "1" };
    const { dependencies, workflow } = setup([active]);
    const input = { visitId: active.id, expectedVersion: "1", clinicalNote: note, metrics: [{ code: "pain_nrs_0_10" as const, value: 3 }] };
    const first = await finishVisit(input, dependencies);
    const retry = await finishVisit(input, dependencies);
    expect(first.visit.status).toBe("finished");
    expect(first.metrics[0]?.id).toBe("obs-active-pain-nrs-0-10");
    expect(retry.visit.id).toBe(first.visit.id);
    expect(workflow.finish).toHaveBeenCalledTimes(1);
  });

  it("rejects a retry that omits an already saved metric", async () => {
    const active: Visit = { id: "visit-active", patientId: patient.id, treatmentId: treatment.id, status: "in-progress", startedAt: "2026-09-15T13:00:00.000Z", captureMode: "live", version: "1" };
    const { dependencies } = setup([active]);
    await finishVisit({ visitId: active.id, expectedVersion: "1", clinicalNote: note, metrics: [{ code: "pain_nrs_0_10" as const, value: 3 }] }, dependencies);
    await expect(finishVisit({ visitId: active.id, expectedVersion: "1", clinicalNote: note, metrics: [] }, dependencies)).rejects.toBeInstanceOf(Error);
  });

  it("sends evaluations and procedures in the same finish operation", async () => {
    const active: Visit = { id: "visit-clinical", patientId: patient.id, treatmentId: treatment.id, status: "in-progress", startedAt: "2026-09-15T13:00:00.000Z", captureMode: "live", version: "1" };
    const { dependencies, workflow } = setup([active]);
    await finishVisit({
      visitId: active.id, expectedVersion: "1", clinicalNote: note, metrics: [], clinicalEntries: {
        evaluations: [{ clientId: "11111111-1111-4111-8111-111111111111", seriesId: "22222222-2222-4222-8222-222222222222", domain: "strength", name: "Fuerza ficticia", result: { kind: "coded", value: "Moderada" } }],
        procedures: [{ family: "manual-therapy" }],
      }
    }, dependencies);
    expect(workflow.finish.mock.calls[0]?.[2]).toHaveLength(1);
    expect(workflow.finish.mock.calls[0]?.[3]).toHaveLength(1);
  });

  it("annuls a start and restores its appointment", async () => {
    const active: Visit = { id: "visit-active", patientId: patient.id, treatmentId: treatment.id, appointmentId: appointment.id, status: "in-progress", startedAt: "2026-09-15T13:00:00.000Z", captureMode: "live", version: "1" };
    const { dependencies, workflow } = setup([active], { ...appointment, status: "fulfilled" });
    await annulVisitStart({ visitId: active.id, expectedVersion: "1" }, dependencies);
    expect(workflow.annul.mock.calls[0]?.[1]).toMatchObject({ status: "booked" });
  });
});
