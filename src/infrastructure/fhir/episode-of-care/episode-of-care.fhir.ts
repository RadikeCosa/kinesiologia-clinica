import type { FhirResource } from "@/infrastructure/fhir/core/fhir.types";

export interface FhirEpisodeOfCare extends FhirResource {
  resourceType: "EpisodeOfCare";
  status: "active" | "finished";
  patient?: { reference?: string };
  period?: {
    start?: string;
    end?: string;
  };
  extension?: Array<{ url?: string; valueString?: string }>;
  diagnosis?: Array<{
    condition?: { reference?: string };
    role?: { coding?: Array<{ system?: string; code?: string }> };
  }>;
}
