import type { FhirResource } from "@/infrastructure/fhir/core/fhir.types";

export interface FhirEpisodeOfCare extends FhirResource {
  resourceType: "EpisodeOfCare";
  status: "active" | "onhold" | "finished";
  meta?: { versionId?: string; lastUpdated?: string };
  patient?: { reference?: string };
  period?: {
    start?: string;
    end?: string;
  };
  extension?: Array<{ url?: string; valueString?: string; valueReference?: { reference?: string }; valuePositiveInt?: number; valueInteger?: number; extension?: Array<{ url?: string; valueString?: string; valueDateTime?: string; valueCode?: string }> }>;
  statusHistory?: Array<{ status?: "active" | "onhold" | "finished"; period?: { start?: string; end?: string } }>;
  diagnosis?: Array<{
    condition?: { reference?: string };
    role?: { coding?: Array<{ system?: string; code?: string }> };
  }>;
}
