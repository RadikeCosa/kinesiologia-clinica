import { describe, expect, it } from "vitest";
import { isClinicalHomeLabEnabled } from "@/domain/system/clinical-home-lab-policy";

describe("isClinicalHomeLabEnabled", () => {
  it("allows the lab in development against the disposable FHIR endpoint", () => {
    expect(
      isClinicalHomeLabEnabled({
        NODE_ENV: "development",
        FHIR_BASE_URL: "http://localhost:8081/fhir",
      }),
    ).toBe(true);
  });

  it("refuses production, Vercel and the local-real endpoint", () => {
    expect(
      isClinicalHomeLabEnabled({
        NODE_ENV: "production",
        FHIR_BASE_URL: "http://localhost:8081/fhir",
      }),
    ).toBe(false);
    expect(
      isClinicalHomeLabEnabled({
        NODE_ENV: "development",
        FHIR_BASE_URL: "http://localhost:8081/fhir",
        VERCEL: "1",
      }),
    ).toBe(false);
    expect(
      isClinicalHomeLabEnabled({
        NODE_ENV: "development",
        FHIR_BASE_URL: "http://localhost:8080/fhir",
      }),
    ).toBe(false);
  });
});
