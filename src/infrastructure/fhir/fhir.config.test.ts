import { describe, expect, it } from "vitest";
import { readFhirConfig } from "./fhir.config";

describe("readFhirConfig", () => {
  it("normalizes the configured endpoint", () => {
    expect(
      readFhirConfig({ FHIR_BASE_URL: "http://localhost:8081/fhir/" }),
    ).toEqual({ baseUrl: "http://localhost:8081/fhir" });
  });

  it("does not invent a default clinical endpoint", () => {
    expect(readFhirConfig({})).toBeNull();
  });
});
