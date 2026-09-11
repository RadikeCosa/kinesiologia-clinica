import type { FhirBundle, FhirResource } from "./fhir.types";
import type { FhirClient } from "./fhir.client";

export function extractResourcesByType<
  TResource extends FhirResource,
>(bundle: FhirBundle, resourceType: TResource["resourceType"]): TResource[] {
  return (bundle.entry ?? [])
    .map((entry) => entry.resource)
    .filter(
      (resource): resource is TResource =>
        resource?.resourceType === resourceType,
    );
}

export function extractNextPageUrl(bundle: FhirBundle): string | null {
  return (
    bundle.link?.find((link) => link.relation === "next")?.url?.trim() ||
    null
  );
}

export async function readAllResourcesByType<
  TResource extends FhirResource,
>(input: {
  client: FhirClient;
  path: string;
  resourceType: TResource["resourceType"];
  maximumPages?: number;
}): Promise<TResource[]> {
  const resources: TResource[] = [];
  const visited = new Set<string>();
  const maximumPages = input.maximumPages ?? 20;
  let nextPath: string | null = input.path;

  while (nextPath && visited.size < maximumPages) {
    if (visited.has(nextPath)) {
      throw new Error("FHIR pagination returned a repeated page.");
    }

    visited.add(nextPath);
    const bundle: FhirBundle = await input.client.get(nextPath);
    resources.push(
      ...extractResourcesByType<TResource>(bundle, input.resourceType),
    );
    nextPath = extractNextPageUrl(bundle);
  }

  if (nextPath) {
    throw new Error("FHIR pagination exceeded the configured page limit.");
  }

  return resources;
}
