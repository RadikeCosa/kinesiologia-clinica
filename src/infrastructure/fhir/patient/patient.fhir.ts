import type { FhirResource } from "@/infrastructure/fhir/core/fhir.types";

export interface FhirPatient extends FhirResource {
  resourceType: "Patient";
  meta?: { lastUpdated?: string };
  name?: Array<{
    family?: string;
    given?: string[];
    text?: string;
  }>;
  telecom?: Array<{
    system?: string;
    value?: string;
  }>;
  address?: Array<{ text?: string }>;
  extension?: Array<{ url?: string; valueString?: string }>;
}
