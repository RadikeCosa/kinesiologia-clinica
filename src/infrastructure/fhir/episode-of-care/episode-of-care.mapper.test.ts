import { describe, expect, it } from "vitest";
import { mapFhirEpisodeOfCare } from "./episode-of-care.mapper";

describe("mapFhirEpisodeOfCare", () => {
  it("maps the existing EpisodeOfCare shape to a treatment", () => {
    expect(
      mapFhirEpisodeOfCare({
        resourceType: "EpisodeOfCare",
        id: "episode-1",
        status: "active",
        patient: { reference: "Patient/patient-1/_history/2" },
        period: { start: "2026-09-01" },
      }),
    ).toEqual({
      metadataRevision: 0,
      id: "episode-1",
      patientId: "patient-1",
      sourceConsultationId: undefined,
      initialEvaluationId: undefined,
      acceptedTreatmentQuoteId: undefined,
      status: "active",
      startDate: "2026-09-01",
      endDate: undefined,
    });
  });

  it("preserves the intake, evaluation and accepted budget references", () => {
    expect(mapFhirEpisodeOfCare({
      resourceType: "EpisodeOfCare", id: "treatment-1", status: "active", patient: { reference: "Patient/patient-1" },
      period: { start: "2026-10-21" }, extension: [
        { url: "https://kinesiologiaadomicilio.local/fhir/StructureDefinition/treatment-origin-consultation-v1", valueReference: { reference: "ServiceRequest/consultation-1" } },
        { url: "https://kinesiologiaadomicilio.local/fhir/StructureDefinition/treatment-initial-evaluation-v1", valueReference: { reference: "Encounter/evaluation-1" } },
        { url: "https://kinesiologiaadomicilio.local/fhir/StructureDefinition/treatment-accepted-budget-v1", valueString: "quote-treatment-v2" },
      ],
    })).toMatchObject({ sourceConsultationId: "consultation-1", initialEvaluationId: "evaluation-1", acceptedTreatmentQuoteId: "quote-treatment-v2" });
  });
});
