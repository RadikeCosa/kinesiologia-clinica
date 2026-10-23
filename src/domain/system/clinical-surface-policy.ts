export function clinicalSurfaceMode(environment: Readonly<Record<string, string | undefined>>): "fictional" | "pilot" | null {
  if (environment.VERCEL === "1") return null;
  const baseUrl = environment.FHIR_BASE_URL?.replace(/\/$/, "");
  const mode = environment.CLINICAL_MODE;
  if ((!mode || mode === "fictional") && baseUrl === "http://localhost:8081/fhir") return "fictional";
  if (mode === "pilot" && baseUrl === "http://localhost:8080/fhir" && environment.CLINICAL_PILOT_READY === "yes") {
    try {
      const origin = new URL(environment.AUTH_ORIGIN ?? "");
      if (["localhost", "127.0.0.1"].includes(origin.hostname) && ["http:", "https:"].includes(origin.protocol)) return "pilot";
    } catch { return null; }
  }
  return null;
}

export function isLocalClinicalSurfaceEnabled(environment: Readonly<Record<string, string | undefined>>): boolean {
  return clinicalSurfaceMode(environment) !== null;
}
