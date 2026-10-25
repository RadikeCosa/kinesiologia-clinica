import { describe, expect, it, vi } from "vitest";
import { readPeriodReport } from "./read-period-report";
function dependencies() {
 const archive = { report: { id: "report-1", patientId: "fake-p", treatmentId: "fake-t", periodId: "fake-period" }, pdf: new Uint8Array([1, 2]) };
 return { archive, reports: { readArchive: vi.fn(async () => archive) }, patients: { getById: vi.fn(async () => ({ id: "fake-p" })) }, treatments: { getById: vi.fn(async () => ({ id: "fake-t", patientId: "fake-p" })) }, periods: { get: vi.fn(async () => ({ id: "fake-period", patientId: "fake-p", treatmentId: "fake-t" })) } };
}
describe("verified report query", () => {
 it("returns the verified archive once for a consistent relationship", async () => { const d = dependencies(); await expect(readPeriodReport("report-1", d as never)).resolves.toBe(d.archive); expect(d.reports.readArchive).toHaveBeenCalledOnce(); });
 it("rejects mismatched patient, treatment and period relationships", async () => {
  for (const resource of ["patients", "treatments", "periods"] as const) {
   const d = dependencies();
   if (resource === "patients") d.patients.getById.mockResolvedValue({ id: "other" });
   if (resource === "treatments") d.treatments.getById.mockResolvedValue({ id: "fake-t", patientId: "other" });
   if (resource === "periods") d.periods.get.mockResolvedValue({ id: "fake-period", patientId: "fake-p", treatmentId: "other" });
   await expect(readPeriodReport("report-1", d as never)).resolves.toBeNull();
  }
 });
 it("rejects malformed ids before persistence and propagates integrity failures", async () => {
  const d = dependencies(); await expect(readPeriodReport("../fake", d as never)).resolves.toBeNull(); expect(d.reports.readArchive).not.toHaveBeenCalled();
  d.reports.readArchive.mockRejectedValue(new Error("integrity")); await expect(readPeriodReport("report-1", d as never)).rejects.toThrow("integrity");
 });
});
