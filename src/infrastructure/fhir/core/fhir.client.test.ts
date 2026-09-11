import { describe, expect, it, vi } from "vitest";
import { createFhirClient } from "./fhir.client";
import { FhirClientError } from "./fhir.errors";

function asFetch(
  implementation: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
): typeof fetch {
  return vi.fn(implementation) as unknown as typeof fetch;
}

describe("createFhirClient", () => {
  it("uses the configured base URL and FHIR headers", async () => {
    const fetcher = asFetch(async () =>
      Response.json({ resourceType: "Patient", id: "patient-1" }),
    );
    const client = createFhirClient({
      baseUrl: "http://localhost:8081/fhir/",
      fetcher,
    });

    await client.get("Patient/patient-1");

    expect(fetcher).toHaveBeenCalledOnce();
    const [url, init] = vi.mocked(fetcher).mock.calls[0];
    expect(String(url)).toBe("http://localhost:8081/fhir/Patient/patient-1");
    expect(init).toMatchObject({
      method: "GET",
      cache: "no-store",
      headers: {
        Accept: "application/fhir+json",
        "Content-Type": "application/fhir+json",
      },
    });
  });

  it("returns a sanitized typed HTTP error", async () => {
    const client = createFhirClient({
      baseUrl: "http://localhost:8081/fhir",
      fetcher: asFetch(async () =>
        Response.json(
          {
            resourceType: "OperationOutcome",
            issue: [{ diagnostics: "Technical diagnostic" }],
          },
          { status: 500 },
        ),
      ),
    });

    const error = await client.get("Patient").catch((caught) => caught);

    expect(error).toBeInstanceOf(FhirClientError);
    expect(error).toMatchObject({
      kind: "http",
      method: "GET",
      path: "Patient",
      status: 500,
      safeMessage: "No se pudo acceder al servidor clínico en este momento.",
    });
  });

  it("refuses to follow a URL outside the configured FHIR endpoint", async () => {
    const client = createFhirClient({
      baseUrl: "http://localhost:8081/fhir",
      fetcher: asFetch(async () => Response.json({})),
    });

    await expect(client.get("http://example.com/Patient")).rejects.toThrow(
      /configured endpoint/i,
    );
  });
});
