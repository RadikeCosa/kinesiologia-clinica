import { describe, expect, it, vi } from "vitest";
import { listActivePatients } from "./list-active-patients";

describe("listActivePatients", () => {
  it("returns only patients referenced by active treatments", async () => {
    const listByIds = vi.fn().mockResolvedValue([
      {
        id: "patient-2",
        givenName: "Bruno",
        familyName: "Gómez",
      },
      {
        id: "patient-1",
        givenName: "Ana",
        familyName: "Pérez",
        phone: "+54 299 555 0101",
      },
    ]);

    const result = await listActivePatients({
      patients: { listByIds },
      treatments: {
        listActive: async () => [
          {
            id: "treatment-1",
            patientId: "patient-1",
            status: "active",
            startDate: "2026-08-01",
          },
          {
            id: "treatment-2",
            patientId: "patient-2",
            status: "active",
            startDate: "2026-09-01",
          },
        ],
      },
    });

    expect(listByIds).toHaveBeenCalledWith(["patient-1", "patient-2"]);
    expect(result.map((patient) => patient.displayName)).toEqual([
      "Ana Pérez",
      "Bruno Gómez",
    ]);
  });

  it("selects the most recent treatment and reports inconsistent duplicates", async () => {
    const result = await listActivePatients({
      patients: {
        listByIds: async () => [
          { id: "patient-1", givenName: "Ana", familyName: "Pérez" },
        ],
      },
      treatments: {
        listActive: async () => [
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
            startDate: "2026-06-01",
          },
        ],
      },
    });

    expect(result[0]).toMatchObject({
      treatment: { id: "newer" },
      dataQuality: { multipleActiveTreatments: true },
    });
  });

  it("does not query patients when there are no active treatments", async () => {
    const listByIds = vi.fn();

    const result = await listActivePatients({
      patients: { listByIds },
      treatments: { listActive: async () => [] },
    });

    expect(result).toEqual([]);
    expect(listByIds).not.toHaveBeenCalled();
  });
});
