import type { FhirResource } from "@/infrastructure/fhir/core/fhir.types";

export interface FhirEpisodeOfCare extends FhirResource {
  resourceType: "EpisodeOfCare";
  status: "active" | "finished";
  patient?: { reference?: string };
  period?: {
    start?: string;
    end?: string;
  };
}
