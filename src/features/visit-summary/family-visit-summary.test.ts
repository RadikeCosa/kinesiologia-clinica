import { describe, expect, it } from "vitest";
import { createFamilyVisitSummary } from "./family-visit-summary";

describe("createFamilyVisitSummary", () => {
  it("builds an editable family message from the visit narrative", () => {
    expect(createFamilyVisitSummary({
      patientGivenName: " Rosa ",
      visitDate: "30 de septiembre de 2026",
      response: "Respondió bien a la actividad.",
      intervention: "Ejercicios de movilidad.",
      nextPlan: "Continuar con la práctica indicada.",
    })).toBe([
      "Hola. Te comparto un resumen de la visita de Rosa del 30 de septiembre de 2026.",
      "Respondió bien a la actividad.",
      "Durante la visita se trabajó: Ejercicios de movilidad.",
      "Próximo paso: Continuar con la práctica indicada.",
    ].join("\n\n"));
  });

  it("omits an empty next step rather than inventing one", () => {
    expect(createFamilyVisitSummary({
      patientGivenName: "Rosa",
      visitDate: "30 de septiembre de 2026",
      response: "",
      intervention: "Ejercicios de movilidad.",
      nextPlan: "  ",
    })).toBe([
      "Hola. Te comparto un resumen de la visita de Rosa del 30 de septiembre de 2026.",
      "Durante la visita se trabajó: Ejercicios de movilidad.",
    ].join("\n\n"));
  });

  it("includes same-visit evaluations and other symptoms without repeating pain already in the narrative", () => {
    const text = createFamilyVisitSummary({
      patientGivenName: "Rosa",
      visitDate: "30 de septiembre de 2026",
      response: "Dolor 4/10 después de caminar.",
      intervention: "Ejercicios de movilidad.",
      evaluations: [
        { name: "Flexión de rodilla", result: { kind: "quantity", value: 102, unit: "grados" }, context: { bodySite: "Rodilla", laterality: "right" } },
        { name: "Equilibrio", result: { kind: "coded", value: "Estable" } },
        { name: "Medición anulada", result: { kind: "quantity", value: 9, unit: "cm" }, status: "entered-in-error" },
      ],
      symptoms: [
        { code: "pain", severity: 4 },
        { code: "tiredness", severity: 2 },
      ],
    });

    expect(text).toContain("Flexión de rodilla (Rodilla derecha): 102 grados");
    expect(text).toContain("Equilibrio: Estable");
    expect(text).toContain("Cansancio: 2/10");
    expect(text.match(/Dolor: 4\/10/g)).toBeNull();
    expect(text).not.toContain("Medición anulada");
  });
});
