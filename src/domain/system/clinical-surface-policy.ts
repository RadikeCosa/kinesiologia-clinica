const SAFE_UNAUTHENTICATED_FHIR_ENDPOINT = "http://localhost:8081/fhir";

export function isLocalClinicalSurfaceEnabled(
  environment: Readonly<Record<string, string | undefined>>,
): boolean {
  const baseUrl = environment.FHIR_BASE_URL?.replace(/\/$/, "");

  return environment.VERCEL !== "1" && baseUrl === SAFE_UNAUTHENTICATED_FHIR_ENDPOINT;
}
