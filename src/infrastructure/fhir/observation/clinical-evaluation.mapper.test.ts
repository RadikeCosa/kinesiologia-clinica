import { describe, expect, it } from "vitest";
import type { ClinicalEvaluation } from "@/domain/visit/clinical-entry";
import { mapClinicalEvaluationToFhir, mapFhirClinicalEvaluation } from "./clinical-evaluation.mapper";

const evaluation: ClinicalEvaluation = { id: "evaluation-11111111-1111-4111-8111-111111111111", clientId: "11111111-1111-4111-8111-111111111111", seriesId: "22222222-2222-4222-8222-222222222222", patientId: "patient-a", visitId: "visit-a", effectiveDateTime: "2026-09-16T10:00:00-03:00", domain: "joint-mobility", name: "Flexión de rodilla", result: { kind: "quantity", value: 90, unit: "grados" }, context: { bodySite: "Rodilla", laterality: "right", method: "Goniómetro", assistanceDevice: "Sin ayuda", conditions: "Sedestación", interpretation: "Mejor tolerancia" } };

describe("clinical evaluation FHIR mapper", () => {
  it("round trips identity, result and context", () => {
    const resource = mapClinicalEvaluationToFhir(evaluation);
    expect(resource.category?.[0]?.coding?.[0]).toMatchObject({ system: "http://terminology.hl7.org/CodeSystem/observation-category", code: "exam" });
    expect(mapFhirClinicalEvaluation(resource)).toEqual(evaluation);
  });

  it("does not classify historical pain observations as functional evaluations", () => {
    const mapped = mapFhirClinicalEvaluation({ resourceType: "Observation", id: "obs-old", status: "final", subject: { reference: "Patient/patient-a" }, encounter: { reference: "Encounter/visit-a" }, effectiveDateTime: "2026-09-16T10:00:00-03:00", code: { coding: [{ system: "https://kinesiologiaadomicilio.local/fhir/CodeSystem/functional-observations", code: "pain-nrs-0-10" }] }, valueQuantity: { value: 4, unit: "score" } });
    expect(mapped).toBeNull();
  });
});
