import { describe, expect, it, vi } from "vitest";
import type { FhirClient } from "./fhir.client";
import { readAllResourcesByType } from "./fhir.bundle";

describe("readAllResourcesByType", () => {
  it("reads pagination and ignores other resource types", async () => {
    const get = vi
      .fn()
      .mockResolvedValueOnce({
        resourceType: "Bundle",
        entry: [
          { resource: { resourceType: "Patient", id: "patient-1" } },
          { resource: { resourceType: "Observation", id: "observation-1" } },
        ],
        link: [{ relation: "next", url: "Patient?page=2" }],
      })
      .mockResolvedValueOnce({
        resourceType: "Bundle",
        entry: [{ resource: { resourceType: "Patient", id: "patient-2" } }],
      });

    const resources = await readAllResourcesByType({
      client: { get } as unknown as FhirClient,
      path: "Patient",
      resourceType: "Patient",
    });

    expect(resources.map((resource) => resource.id)).toEqual([
      "patient-1",
      "patient-2",
    ]);
    expect(get).toHaveBeenNthCalledWith(2, "Patient?page=2");
  });

  it("rejects repeated pages instead of looping", async () => {
    const get = vi.fn().mockResolvedValue({
      resourceType: "Bundle",
      link: [{ relation: "next", url: "Patient" }],
    });

    await expect(
      readAllResourcesByType({
        client: { get } as unknown as FhirClient,
        path: "Patient",
        resourceType: "Patient",
      }),
    ).rejects.toThrow(/repeated page/i);
  });
});
