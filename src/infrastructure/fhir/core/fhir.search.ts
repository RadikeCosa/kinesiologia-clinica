export function buildResourceSearchPath(
  resourceType: string,
  parameters: URLSearchParams,
): string {
  const query = parameters.toString();
  return query ? `${resourceType}?${query}` : resourceType;
}

export function buildPatientsByIdsSearch(ids: string[]): string {
  const normalized = [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
  if (!normalized.length) return "";

  return buildResourceSearchPath(
    "Patient",
    new URLSearchParams({ _id: normalized.join(",") }),
  );
}

export function buildActiveTreatmentsSearch(): string {
  return buildResourceSearchPath(
    "EpisodeOfCare",
    new URLSearchParams({ status: "active", _count: "200" }),
  );
}
