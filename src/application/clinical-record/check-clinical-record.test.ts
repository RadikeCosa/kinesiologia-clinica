import { describe, expect, it } from "vitest";
import { checkClinicalRecord } from "./check-clinical-record";

describe("checkClinicalRecord", () => {
  it("returns the gateway status with a stable check time", async () => {
    const result = await checkClinicalRecord(
      { checkAvailability: async () => "available" },
      () => new Date("2026-09-11T12:00:00.000Z"),
    );

    expect(result).toEqual({
      status: "available",
      checkedAt: "2026-09-11T12:00:00.000Z",
    });
  });
});
