import { z } from "zod";

const fhirConfigSchema = z.object({
  FHIR_BASE_URL: z.url().transform((value) => value.replace(/\/$/, "")),
});

export interface FhirConfig {
  baseUrl: string;
}

export function readFhirConfig(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): FhirConfig | null {
  const result = fhirConfigSchema.safeParse(environment);

  if (!result.success) {
    return null;
  }

  return { baseUrl: result.data.FHIR_BASE_URL };
}
