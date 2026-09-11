export function extractIdFromReference(reference?: string): string | undefined {
  const normalized = reference?.trim().replace(/\/$/, "");
  if (!normalized) return undefined;

  const historyMatch = normalized.match(/\/([^/]+)\/_history\/[^/]+$/);
  if (historyMatch?.[1]) return historyMatch[1];

  return normalized.split("/").filter(Boolean).at(-1);
}
