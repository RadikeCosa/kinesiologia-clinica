import { describe, expect, it } from "vitest";
import { clinicalEvaluationInputSchema, visitClinicalEntriesSchema } from "./clinical-entry";

const base = { clientId: "11111111-1111-4111-8111-111111111111", seriesId: "22222222-2222-4222-8222-222222222222", domain: "pain-symptoms" as const, name: "Evaluación ficticia" };

describe("clinical evaluation", () => {
  it.each([
    { kind: "quantity", value: 3, unit: "cm" }, { kind: "coded", value: "leve" },
    { kind: "boolean", value: true }, { kind: "narrative", value: "Respuesta ficticia" },
    { kind: "absent", reason: "deferred" },
  ])("accepts $kind results", (result) => expect(clinicalEvaluationInputSchema.parse({ ...base, result })).toBeTruthy());

  it("validates Pain NRS and the visit limit", () => {
    expect(() => clinicalEvaluationInputSchema.parse({ ...base, name: "Dolor NRS", result: { kind: "quantity", value: 11 } })).toThrow();
    expect(() => visitClinicalEntriesSchema.parse({ evaluations: Array.from({ length: 21 }, (_, index) => ({ ...base, clientId: `11111111-1111-4111-8111-${String(index).padStart(12, "0")}`, result: { kind: "narrative", value: "Ficticio" } })), procedures: [] })).toThrow();
  });

  it("requires a name for Other and prevents duplicate families", () => {
    expect(() => visitClinicalEntriesSchema.parse({ evaluations: [], procedures: [{ family: "other" }] })).toThrow();
    expect(() => visitClinicalEntriesSchema.parse({ evaluations: [], procedures: [{ family: "manual-therapy" }, { family: "manual-therapy" }] })).toThrow();
  });
});
