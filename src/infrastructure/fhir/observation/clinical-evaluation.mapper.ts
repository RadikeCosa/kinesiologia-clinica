import type { ClinicalEvaluation, EvaluationAbsentReason, EvaluationDomain } from "@/domain/visit/clinical-entry";
import { extractIdFromReference } from "@/infrastructure/fhir/core/fhir.references";
import type { FhirResource } from "@/infrastructure/fhir/core/fhir.types";

const ROOT = "https://kinesiologiaadomicilio.local/fhir";
export const EVALUATION_SYSTEM = `${ROOT}/CodeSystem/clinical-evaluation`;
export const DOMAIN_SYSTEM = `${ROOT}/CodeSystem/clinical-evaluation-domain`;
export const SERIES_URL = `${ROOT}/StructureDefinition/observation-series-identity-v1`;
const LATERALITY_URL = `${ROOT}/StructureDefinition/observation-laterality-v1`;
const ASSISTANCE_URL = `${ROOT}/StructureDefinition/observation-assistance-device-v1`;
const CONDITIONS_URL = `${ROOT}/StructureDefinition/observation-conditions-v1`;
const ABSENT_SYSTEM = `${ROOT}/CodeSystem/clinical-evaluation-absent-reason`;
const LEGACY_SYSTEM = `${ROOT}/CodeSystem/functional-observations`;

const legacy: Record<string, { domain: EvaluationDomain; name: string; seriesId: string }> = {
  "tug-seconds": { domain: "gait-mobility", name: "Timed Up and Go", seriesId: "cde66f42-025f-4a92-b411-04f134f44101" },
  "pain-nrs-0-10": { domain: "pain-symptoms", name: "Dolor NRS", seriesId: "cde66f42-025f-4a92-b411-04f134f44102" },
  "standing-tolerance-minutes": { domain: "environment-independence", name: "Tolerancia a bipedestación", seriesId: "cde66f42-025f-4a92-b411-04f134f44103" },
  "gait-duration-minutes": { domain: "gait-mobility", name: "Duración de marcha", seriesId: "cde66f42-025f-4a92-b411-04f134f44104" },
};

type Coding = { system?: string; code?: string; display?: string };
export interface FhirClinicalObservation extends FhirResource {
  resourceType: "Observation"; status: string;
  extension?: Array<{ url?: string; valueIdentifier?: { value?: string }; valueCode?: string; valueString?: string }>;
  category?: Array<{ coding?: Coding[] }>;
  code?: { coding?: Coding[]; text?: string };
  subject?: { reference?: string }; encounter?: { reference?: string }; effectiveDateTime?: string;
  valueQuantity?: { value?: number; unit?: string };
  valueCodeableConcept?: { coding?: Coding[]; text?: string };
  valueString?: string;
  dataAbsentReason?: { coding?: Coding[]; text?: string };
  bodySite?: { text?: string }; method?: { text?: string }; note?: Array<{ text?: string }>;
}

export function mapClinicalEvaluationToFhir(value: ClinicalEvaluation): FhirClinicalObservation {
  const extension: NonNullable<FhirClinicalObservation["extension"]> = [{ url: SERIES_URL, valueIdentifier: { value: value.seriesId } }];
  if (value.context?.laterality) extension.push({ url: LATERALITY_URL, valueCode: value.context.laterality });
  if (value.context?.assistanceDevice) extension.push({ url: ASSISTANCE_URL, valueString: value.context.assistanceDevice });
  if (value.context?.conditions) extension.push({ url: CONDITIONS_URL, valueString: value.context.conditions });
  const result = value.result;
  return {
    resourceType: "Observation", id: value.id, status: "final", extension,
    category: [{ coding: [{ system: DOMAIN_SYSTEM, code: value.domain }] }],
    code: { coding: [{ system: EVALUATION_SYSTEM, code: value.name === "Dolor NRS" ? "pain-nrs" : "custom-evaluation", display: value.name }], text: value.name },
    subject: { reference: `Patient/${value.patientId}` }, encounter: { reference: `Encounter/${value.visitId}` }, effectiveDateTime: value.effectiveDateTime,
    ...(result.kind === "quantity" ? { valueQuantity: { value: result.value, ...(result.unit ? { unit: result.unit } : {}) } } : {}),
    ...(result.kind === "coded" ? { valueCodeableConcept: { text: result.value } } : {}),
    ...(result.kind === "boolean" ? { valueCodeableConcept: { coding: [{ system: "http://terminology.hl7.org/CodeSystem/v2-0136", code: result.value ? "Y" : "N", display: result.value ? "Sí" : "No" }] } } : {}),
    ...(result.kind === "narrative" ? { valueString: result.value } : {}),
    ...(result.kind === "absent" ? { dataAbsentReason: { coding: [{ system: ABSENT_SYSTEM, code: result.reason }], ...(result.note ? { text: result.note } : {}) } } : {}),
    ...(value.context?.bodySite ? { bodySite: { text: value.context.bodySite } } : {}),
    ...(value.context?.method ? { method: { text: value.context.method } } : {}),
    ...(value.context?.interpretation ? { note: [{ text: value.context.interpretation }] } : {}),
  };
}

export function mapFhirClinicalEvaluation(resource: FhirClinicalObservation): ClinicalEvaluation | null {
  const patientId = extractIdFromReference(resource.subject?.reference), visitId = extractIdFromReference(resource.encounter?.reference);
  if (!resource.id || !patientId || !visitId || !resource.effectiveDateTime) return null;
  const newCoding = resource.code?.coding?.find((item) => item.system === EVALUATION_SYSTEM);
  const legacyCoding = resource.code?.coding?.find((item) => item.system === LEGACY_SYSTEM);
  const historical = legacyCoding?.code ? legacy[legacyCoding.code] : undefined;
  if (!newCoding && !historical) return null;
  const domain = (resource.category?.flatMap((item) => item.coding ?? []).find((item) => item.system === DOMAIN_SYSTEM)?.code ?? historical?.domain) as EvaluationDomain | undefined;
  const name = resource.code?.text ?? newCoding?.display ?? historical?.name;
  const seriesId = resource.extension?.find((item) => item.url === SERIES_URL)?.valueIdentifier?.value ?? historical?.seriesId;
  if (!domain || !name || !seriesId) return null;
  let result: ClinicalEvaluation["result"];
  if (resource.valueQuantity?.value !== undefined) result = { kind: "quantity", value: resource.valueQuantity.value, ...(resource.valueQuantity.unit ? { unit: resource.valueQuantity.unit } : {}) };
  else if (resource.valueString !== undefined) result = { kind: "narrative", value: resource.valueString };
  else if (resource.valueCodeableConcept?.coding?.some((item) => item.system === "http://terminology.hl7.org/CodeSystem/v2-0136")) result = { kind: "boolean", value: resource.valueCodeableConcept.coding.some((item) => item.code === "Y") };
  else if (resource.valueCodeableConcept?.text) result = { kind: "coded", value: resource.valueCodeableConcept.text };
  else if (resource.dataAbsentReason?.coding?.[0]?.code) result = { kind: "absent", reason: resource.dataAbsentReason.coding[0].code as EvaluationAbsentReason, ...(resource.dataAbsentReason.text ? { note: resource.dataAbsentReason.text } : {}) };
  else return null;
  const context = {
    bodySite: resource.bodySite?.text,
    laterality: resource.extension?.find((item) => item.url === LATERALITY_URL)?.valueCode as "left" | "right" | "bilateral" | undefined,
    method: resource.method?.text,
    assistanceDevice: resource.extension?.find((item) => item.url === ASSISTANCE_URL)?.valueString,
    conditions: resource.extension?.find((item) => item.url === CONDITIONS_URL)?.valueString,
    interpretation: resource.note?.[0]?.text,
  };
  const hasContext = Object.values(context).some(Boolean);
  return { id: resource.id, clientId: resource.id.replace(/^evaluation-/, ""), seriesId, patientId, visitId, effectiveDateTime: resource.effectiveDateTime, domain, name, result, ...(hasContext ? { context } : {}) };
}
