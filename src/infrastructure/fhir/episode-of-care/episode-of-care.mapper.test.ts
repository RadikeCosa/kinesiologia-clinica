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
      id: "episode-1",
      patientId: "patient-1",
      status: "active",
      startDate: "2026-09-01",
      endDate: undefined,
    });
  });
});
