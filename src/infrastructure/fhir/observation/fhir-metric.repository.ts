import type { MetricRepository } from "@/application/visits/metric.repository";
import type { FunctionalMetric, MetricCode } from "@/domain/visit/visit";
import { readAllResourcesByType } from "@/infrastructure/fhir/core/fhir.bundle";
import type { FhirClient } from "@/infrastructure/fhir/core/fhir.client";
import { FhirClientError } from "@/infrastructure/fhir/core/fhir.errors";
import { extractIdFromReference } from "@/infrastructure/fhir/core/fhir.references";
import type { FhirResource } from "@/infrastructure/fhir/core/fhir.types";

const SYSTEM = "https://kinesiologiaadomicilio.local/fhir/CodeSystem/functional-observations";
const DEFINITIONS = {
  tug_seconds: { code: "tug-seconds", display: "Timed Up and Go (segundos)", unit: "s" },
  pain_nrs_0_10: { code: "pain-nrs-0-10", display: "Dolor NRS 0-10", unit: "score" },
  standing_tolerance_minutes: { code: "standing-tolerance-minutes", display: "Tolerancia a bipedestación (minutos)", unit: "min" },
  gait_duration_minutes: { code: "gait-duration-minutes", display: "Marcha (minutos)", unit: "min" },
} as const;

interface FhirObservation extends FhirResource {
  resourceType: "Observation";
  status: string;
  subject?: { reference?: string };
  encounter?: { reference?: string };
  effectiveDateTime?: string;
  code?: { coding?: Array<{ system?: string; code?: string; display?: string }>; text?: string };
  valueQuantity?: { value?: number; unit?: string; system?: string; code?: string };
}

function mapObservation(resource: FhirObservation): FunctionalMetric | null {
  const coding = resource.code?.coding?.find((item) => item.system === SYSTEM);
  const code = (Object.keys(DEFINITIONS) as MetricCode[]).find((key) => DEFINITIONS[key].code === coding?.code);
  const patientId = extractIdFromReference(resource.subject?.reference);
  const visitId = extractIdFromReference(resource.encounter?.reference);
  if (!code || !patientId || !visitId || !resource.id || resource.valueQuantity?.value === undefined || !resource.effectiveDateTime) return null;
  return {
    id: resource.id, patientId, visitId, code, value: resource.valueQuantity.value,
    effectiveDateTime: resource.effectiveDateTime,
    unit: resource.valueQuantity.unit ?? DEFINITIONS[code].unit,
  };
}

function toFhir(metric: FunctionalMetric): FhirObservation {
  const definition = DEFINITIONS[metric.code];
  return {
    resourceType: "Observation", id: metric.id, status: "final",
    subject: { reference: `Patient/${metric.patientId}` },
    encounter: { reference: `Encounter/${metric.visitId}` },
    effectiveDateTime: metric.effectiveDateTime,
    code: { coding: [{ system: SYSTEM, code: definition.code, display: definition.display }], text: definition.display },
    valueQuantity: { value: metric.value, unit: definition.unit },
  };
}

export function createFhirMetricRepository(client: FhirClient): MetricRepository {
  return {
    async listByVisitId(visitId) {
      if (!/^[A-Za-z0-9.-]{1,64}$/.test(visitId)) return [];
      const query = new URLSearchParams({ encounter: `Encounter/${visitId}`, _count: "100" });
      const resources = await readAllResourcesByType<FhirObservation>({ client, path: `Observation?${query}`, resourceType: "Observation" });
      return resources.flatMap((resource) => mapObservation(resource) ?? []).filter((metric) => metric.visitId === visitId);
    },
    async putIfAbsent(metric) {
      let existing: FhirObservation | null = null;
      try {
        existing = await client.get<FhirObservation>(`Observation/${metric.id}`);
      } catch (error) {
        if (!(error instanceof FhirClientError && error.status === 404)) throw error;
      }
      if (existing) {
        const mapped = mapObservation(existing);
        if (!mapped || mapped.patientId !== metric.patientId || mapped.visitId !== metric.visitId || mapped.code !== metric.code || mapped.value !== metric.value || mapped.effectiveDateTime !== metric.effectiveDateTime) {
          throw new Error("La métrica ya existe con otro contenido.");
        }
        return;
      }
      await client.put<FhirObservation>(`Observation/${metric.id}`, toFhir(metric));
    },
  };
}
