import { describe, expect, it } from "vitest";
import { mapFhirPatient } from "./patient.mapper";

describe("mapFhirPatient", () => {
  it("maps the legacy patient shape needed by the active list", () => {
    expect(
      mapFhirPatient({
        resourceType: "Patient",
        id: "patient-1",
        meta: { lastUpdated: "2026-09-11T12:00:00Z" },
        name: [{ family: "Pérez", given: ["Ana", "María"] }],
        telecom: [
          { system: "email", value: "fictional@example.test" },
          { system: "phone", value: " +54 299 555 0101 " },
        ],
      }),
    ).toEqual({
      id: "patient-1",
      givenName: "Ana María",
      familyName: "Pérez",
      phone: "+54 299 555 0101",
      updatedAt: "2026-09-11T12:00:00Z",
    });
  });

  it("supports legacy text-only names", () => {
    expect(
      mapFhirPatient({
        resourceType: "Patient",
        id: "legacy",
        name: [{ text: "Paciente Ficticio" }],
      }),
    ).toMatchObject({
      givenName: "Paciente Ficticio",
      familyName: "",
    });
  });
});
