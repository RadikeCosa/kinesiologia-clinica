import { describe, expect, it } from "vitest";
import type { ClinicalSymptom } from "@/domain/visit/clinical-entry";
import { mapClinicalSymptomToFhir, mapFhirClinicalSymptom } from "./clinical-symptom.mapper";
import { EVALUATION_SYSTEM, LEGACY_SYSTEM } from "./clinical-evaluation.mapper";

const symptom: ClinicalSymptom = {
  id: "symptom-11111111-1111-4111-8111-111111111111",
  clientId: "11111111-1111-4111-8111-111111111111",
  seriesId: "22222222-2222-4222-8222-222222222222",
  code: "pain",
  severity: 0,
  context: { bodySite: "Rodilla", laterality: "right", note: "Al caminar" },
  patientId: "patient-a",
  visitId: "visit-a",
  effectiveDateTime: "2026-09-16T10:00:00-03:00",
};

describe("clinical symptom FHIR mapper", () => {
  it("round trips a reported zero score with UCUM and FHIR references", () => {
    const resource = mapClinicalSymptomToFhir(symptom);
    expect(resource).toMatchObject({
      category: [{ coding: [{ system: "http://terminology.hl7.org/CodeSystem/observation-category", code: "survey" }] }],
      code: { coding: [{ system: "http://loinc.org", code: "112494-0" }] },
      subject: { reference: "Patient/patient-a" }, encounter: { reference: "Encounter/visit-a" },
      effectiveDateTime: symptom.effectiveDateTime, performer: [{ reference: "Patient/patient-a" }],
      valueQuantity: { value: 0, unit: "score", system: "http://unitsofmeasure.org", code: "{score}" },
    });
    expect(mapFhirClinicalSymptom(resource)).toEqual(symptom);
  });

  it("uses the local symptom code for custom items", () => {
    const custom: ClinicalSymptom = { ...symptom, id: "symptom-33333333-3333-4333-8333-333333333333", clientId: "33333333-3333-4333-8333-333333333333", code: "custom", name: "Calambres" };
    const resource = mapClinicalSymptomToFhir(custom);
    expect(resource.code).toMatchObject({ coding: [{ system: expect.stringContaining("/CodeSystem/clinical-symptom"), code: "custom-symptom" }], text: "Calambres" });
    expect(mapFhirClinicalSymptom(resource)).toEqual(custom);
  });

  it.each([
    { system: EVALUATION_SYSTEM, code: "pain-nrs" },
    { system: LEGACY_SYSTEM, code: "pain-nrs-0-10" },
  ])("reads historical pain code $code without requiring its old category", ({ system, code }) => {
    const mapped = mapFhirClinicalSymptom({
      resourceType: "Observation", id: "evaluation-historical", status: "final",
      subject: { reference: "Patient/patient-a" }, encounter: { reference: "Encounter/visit-a" },
      effectiveDateTime: "2026-09-16T10:00:00-03:00", code: { coding: [{ system, code }] },
      valueQuantity: { value: 4, unit: "score" },
    });
    expect(mapped).toMatchObject({ code: "pain", severity: 4, patientId: "patient-a", visitId: "visit-a" });
  });

  it("ignores unscored observations and scores outside the scale", () => {
    const resource = mapClinicalSymptomToFhir(symptom);
    expect(mapFhirClinicalSymptom({ ...resource, valueQuantity: undefined })).toBeNull();
    expect(mapFhirClinicalSymptom({ ...resource, valueQuantity: { value: 11, unit: "score" } })).toBeNull();
  });
});
