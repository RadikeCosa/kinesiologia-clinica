import { describe, expect, it } from "vitest";
import { mapFhirPerformedProcedure, mapPerformedProcedureToFhir } from "./procedure.mapper";

describe("Procedure FHIR mapper", () => {
  it("round trips an Other procedure", () => {
    const value = { id: "proc-a-other", patientId: "patient-a", visitId: "visit-a", family: "other" as const, otherName: "Vendaje ficticio", performedStart: "2026-09-16T10:00:00-03:00", performedEnd: "2026-09-16T11:00:00-03:00" };
    expect(mapFhirPerformedProcedure(mapPerformedProcedureToFhir(value))).toEqual(value);
  });
});
