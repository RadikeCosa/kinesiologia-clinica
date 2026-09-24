import { describe, expect, it } from "vitest";
import { clinicalEvaluationInputSchema, visitClinicalEntriesSchema } from "./clinical-entry";

const base = { clientId: "11111111-1111-4111-8111-111111111111", seriesId: "22222222-2222-4222-8222-222222222222", domain: "strength" as const, name: "Evaluación ficticia" };

describe("clinical evaluation", () => {
  it.each([
    { kind: "quantity", value: 3, unit: "cm" }, { kind: "coded", value: "leve" },
    { kind: "boolean", value: true }, { kind: "narrative", value: "Respuesta ficticia" },
    { kind: "absent", reason: "deferred" },
  ])("accepts $kind results", (result) => expect(clinicalEvaluationInputSchema.parse({ ...base, result })).toBeTruthy());

  it("keeps pain outside functional evaluations and enforces the visit limit", () => {
    expect(() => clinicalEvaluationInputSchema.parse({ ...base, name: "Dolor NRS", result: { kind: "quantity", value: 4 } })).toThrow();
    expect(() => clinicalEvaluationInputSchema.parse({ ...base, domain: "pain-symptoms", result: { kind: "narrative", value: "Dolor" } })).toThrow();
    expect(() => visitClinicalEntriesSchema.parse({ evaluations: Array.from({ length: 21 }, (_, index) => ({ ...base, clientId: `11111111-1111-4111-8111-${String(index).padStart(12, "0")}`, result: { kind: "narrative", value: "Ficticio" } })), procedures: [] })).toThrow();
  });

  it("stores only explicit symptom scores from zero through ten", () => {
    const symptom = { clientId: base.clientId, seriesId: base.seriesId, code: "pain", severity: 0 };
    expect(visitClinicalEntriesSchema.parse({ symptoms: [symptom] }).symptoms[0]?.severity).toBe(0);
    expect(() => visitClinicalEntriesSchema.parse({ symptoms: [{ ...symptom, severity: -1 }] })).toThrow();
    expect(() => visitClinicalEntriesSchema.parse({ symptoms: [{ ...symptom, severity: 10.5 }] })).toThrow();
    expect(() => visitClinicalEntriesSchema.parse({ symptoms: [{ clientId: base.clientId, seriesId: base.seriesId, code: "custom", severity: 4 }] })).toThrow();
    expect(() => visitClinicalEntriesSchema.parse({ symptoms: [{ clientId: base.clientId, seriesId: base.seriesId, code: "pain", name: "Another label", severity: 4 }] })).toThrow();
    expect(() => visitClinicalEntriesSchema.parse({ symptoms: [symptom, { ...symptom, clientId: "33333333-3333-4333-8333-333333333333", seriesId: "44444444-4444-4444-8444-444444444444" }] })).toThrow();
    expect(visitClinicalEntriesSchema.parse({ symptoms: [] }).symptoms).toEqual([]);
    expect(visitClinicalEntriesSchema.parse({}).symptoms).toEqual([]);
  });

  it("requires a name for Other and prevents duplicate families", () => {
    expect(() => visitClinicalEntriesSchema.parse({ evaluations: [], procedures: [{ family: "other" }] })).toThrow();
    expect(() => visitClinicalEntriesSchema.parse({ evaluations: [], procedures: [{ family: "manual-therapy" }, { family: "manual-therapy" }] })).toThrow();
  });
});
