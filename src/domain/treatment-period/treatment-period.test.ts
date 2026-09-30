import { describe, expect, it } from "vitest";
import { admissionIssue, periodCount, reconcilePeriod, validQuota, type TreatmentPeriod } from "./treatment-period";
import type { Visit } from "../visit/visit";
const p: TreatmentPeriod = { id: "p1", patientId: "fake", treatmentId: "t1", ordinal: 1, quota: 10, phase: "open", available: true, clinicalRevision: 0 };
const visits = (n: number): Visit[] => Array.from({ length: n }, (_,i) => ({ id: `v${i}`, patientId: "fake", treatmentId: "t1", status: "finished", startedAt: "2026-09-20T10:00:00Z" }));
describe("period admission and derived counts", () => {
  it("rejects zero and missing quota, supports 1 through 500", () => { expect(validQuota(0)).toBe(false); expect(validQuota(1)).toBe(true); expect(validQuota(500)).toBe(true); expect(validQuota(501)).toBe(false); expect(admissionIssue({...p,quota:undefined},[])).toMatch(/Definir cupo/); });
  it("reserves the last slot and allows no additional visit", () => { const all=[...visits(9), {...visits(1)[0],id:"active",status:"in-progress" as const}]; expect(periodCount(p,all)).toEqual({completed:9,reserved:1}); expect(admissionIssue(p,all)).toMatch(/en curso/); expect(reconcilePeriod(p,all).phase).toBe("open"); });
  it("counts distinct visits, excludes errors and keeps untagged visits in period one", () => { const all=[...visits(10),visits(1)[0],{...visits(1)[0],id:"error",status:"entered-in-error" as const}]; expect(periodCount(p,all).completed).toBe(10); expect(periodCount({...p,id:"p2",ordinal:2},all).completed).toBe(0); expect(reconcilePeriod(p,all).phase).toBe("report-pending"); });
  it("annulment reopens a pending quota, never reopens reported or closed periods", () => { expect(reconcilePeriod({...p,phase:"report-pending",closure:"quota"},visits(9)).phase).toBe("open"); for(const phase of ["closed","reported"] as const) expect(reconcilePeriod({...p,phase},[]).phase).toBe(phase); });
  it("retains partial closure and blocks a full quota of one", () => { expect(reconcilePeriod({...p,phase:"report-pending",closure:"partial"},visits(6)).closure).toBe("partial"); expect(admissionIssue({...p,quota:1},visits(1))).toMatch(/informe/); });
});
