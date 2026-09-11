import { describe, expect, it } from "vitest";
import { isLocalClinicalSurfaceEnabled } from "@/domain/system/clinical-surface-policy";

describe("isLocalClinicalSurfaceEnabled", () => {
  it("allows only the disposable localhost FHIR endpoint", () => {
    expect(
      isLocalClinicalSurfaceEnabled({
        FHIR_BASE_URL: "http://localhost:8081/fhir",
      }),
    ).toBe(true);
    expect(
      isLocalClinicalSurfaceEnabled({
        FHIR_BASE_URL: "http://localhost:8081/fhir/",
      }),
    ).toBe(true);
  });

  it("refuses the local-real endpoint and missing configuration", () => {
    expect(
      isLocalClinicalSurfaceEnabled({
        FHIR_BASE_URL: "http://localhost:8080/fhir",
      }),
    ).toBe(false);
    expect(isLocalClinicalSurfaceEnabled({})).toBe(false);
  });

  it("refuses Vercel even if a disposable-looking endpoint is configured", () => {
    expect(
      isLocalClinicalSurfaceEnabled({
        FHIR_BASE_URL: "http://localhost:8081/fhir",
        VERCEL: "1",
      }),
    ).toBe(false);
  });
});
