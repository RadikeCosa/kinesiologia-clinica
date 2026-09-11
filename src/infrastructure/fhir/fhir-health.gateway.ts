import "server-only";

import type { ClinicalRecordHealthGateway } from "@/application/clinical-record/clinical-record-health.gateway";
import { readFhirConfig } from "./fhir.config";

export function createFhirHealthGateway(
  fetcher: typeof fetch = fetch,
): ClinicalRecordHealthGateway {
  return {
    async checkAvailability() {
      const config = readFhirConfig();

      if (!config) {
        return "not_configured";
      }

      try {
        const response = await fetcher(`${config.baseUrl}/metadata`, {
          headers: { Accept: "application/fhir+json" },
          signal: AbortSignal.timeout(5_000),
        });

        return response.ok ? "available" : "unavailable";
      } catch {
        return "unavailable";
      }
    },
  };
}
