import { describe, expect, it } from "vitest";
import { presentActivePatients } from "./active-patient-list.presenter";

describe("presentActivePatients", () => {
  it("formats the treatment start without shifting the calendar date", () => {
    const [patient] = presentActivePatients([
      {
        id: "patient-fixture",
        displayName: "Paciente Ficticio",
        treatment: {
          id: "treatment-fixture",
          startDate: "2026-09-01",
        },
        dataQuality: {
          multipleActiveTreatments: false,
        },
      },
    ]);

    expect(patient.treatmentStartLabel).toBe("1 de sept de 2026");
  });
});
