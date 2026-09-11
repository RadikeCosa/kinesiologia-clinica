import { describe, expect, it } from "vitest";
import { selectMostRecentTreatment } from "./treatment";

describe("selectMostRecentTreatment", () => {
  it("selects the latest valid start date", () => {
    const selected = selectMostRecentTreatment([
      {
        id: "older",
        patientId: "patient-1",
        status: "active",
        startDate: "2026-01-01",
      },
      {
        id: "newer",
        patientId: "patient-1",
        status: "active",
        startDate: "2026-07-01",
      },
    ]);

    expect(selected?.id).toBe("newer");
  });

  it("keeps stable order when dates tie or are invalid", () => {
    const selected = selectMostRecentTreatment([
      {
        id: "first",
        patientId: "patient-1",
        status: "active",
        startDate: "invalid",
      },
      {
        id: "second",
        patientId: "patient-1",
        status: "active",
        startDate: "also-invalid",
      },
    ]);

    expect(selected?.id).toBe("first");
  });
});
