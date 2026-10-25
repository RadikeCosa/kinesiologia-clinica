import { describe, expect, it, vi } from "vitest";
import { createClinicalWorkflow } from "./create-clinical-workflow";
import type { ClinicalWorkflowRepository } from "./clinical-workflow.repository";
import type { Visit } from "@/domain/visit/visit";
const visit: Visit = { id: "fake-visit", patientId: "fake-patient", treatmentId: "fake-treatment", status: "finished", startedAt: "2026-10-01T12:00:00Z" };
describe("application period preparation", () => {
 it("reads the period before visits and passes its original version into the commit", async () => {
  const calls: string[] = [];
  const period = { id: "fake-period", patientId: visit.patientId, treatmentId: visit.treatmentId, ordinal: 1, quota: 1, available: true, phase: "open" as const, clinicalRevision: 3, version: "7" };
  const commit = vi.fn(async () => { calls.push("commit"); });
  const repository = { completeRetrospective: commit } as unknown as ClinicalWorkflowRepository;
  const ports = { treatments: { getById: async () => ({ id: visit.treatmentId, patientId: visit.patientId, status: "active", currentPeriodId: period.id }) }, periods: { materialize: async () => { calls.push("period"); return period; } }, visits: { listByPatientId: async () => { calls.push("visits"); return []; } } };
  await createClinicalWorkflow(repository, ports as never).completeRetrospective(visit, [], [], []);
  expect(calls).toEqual(["period", "visits", "commit"]);
  expect(commit).toHaveBeenCalledWith(expect.objectContaining({ periodId: period.id, preparedPeriod: expect.objectContaining({ version: "7", clinicalRevision: 4, phase: "report-pending" }) }), [], [], []);
 });
 it("does not call persistence when admission is denied", async () => {
  const commit = vi.fn();
  const period = { id: "fake-period", patientId: visit.patientId, treatmentId: visit.treatmentId, ordinal: 1, quota: 1, available: true, phase: "reported", clinicalRevision: 1, version: "7" };
  const ports = { treatments: { getById: async () => ({ id: visit.treatmentId, patientId: visit.patientId, status: "active" }) }, periods: { materialize: async () => period }, visits: { listByPatientId: async () => [] } };
  await expect(createClinicalWorkflow({ completeRetrospective: commit } as never, ports as never).completeRetrospective(visit, [], [], [])).rejects.toThrow();
  expect(commit).not.toHaveBeenCalled();
 });
});
