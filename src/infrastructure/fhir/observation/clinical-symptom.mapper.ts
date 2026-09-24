import type { ClinicalSymptom, SymptomCode } from "@/domain/visit/clinical-entry";
import { extractIdFromReference } from "@/infrastructure/fhir/core/fhir.references";
import type { FhirClinicalObservation } from "./clinical-evaluation.mapper";
import { EVALUATION_SYSTEM, LATERALITY_URL, LEGACY_SYSTEM, SERIES_URL } from "./clinical-evaluation.mapper";

const ROOT = "https://kinesiologiaadomicilio.local/fhir";
export const SYMPTOM_SYSTEM = `${ROOT}/CodeSystem/clinical-symptom`;
const OBSERVATION_CATEGORY_SYSTEM = "http://terminology.hl7.org/CodeSystem/observation-category";
const UCUM_SYSTEM = "http://unitsofmeasure.org";
const HISTORIC_PAIN_SERIES = "cde66f42-025f-4a92-b411-04f134f44102";

const loincCodes: Partial<Record<SymptomCode, string>> = {
  pain: "112494-0",
  tiredness: "112495-7",
  drowsiness: "112496-5",
  nausea: "112497-3",
  "lack-of-appetite": "112498-1",
  "shortness-of-breath": "112499-9",
  depression: "112500-4",
  anxiety: "112501-2",
};

const symptomNames: Record<Exclude<SymptomCode, "custom">, string> = {
  pain: "Dolor", tiredness: "Cansancio", drowsiness: "Somnolencia", nausea: "Náuseas",
  "lack-of-appetite": "Falta de apetito", "shortness-of-breath": "Falta de aire",
  depression: "Ánimo bajo", anxiety: "Ansiedad",
};
const symptomCodeForLoinc = new Map(Object.entries(loincCodes).map(([key, value]) => [value, key as SymptomCode]));

function getCoding(resource: FhirClinicalObservation, system: string, code: string) {
  return resource.code?.coding?.find((coding) => coding.system === system && coding.code === code);
}

export function mapClinicalSymptomToFhir(value: ClinicalSymptom): FhirClinicalObservation {
  const name = value.code === "custom" ? value.name! : symptomNames[value.code];
  const extension: NonNullable<FhirClinicalObservation["extension"]> = [{ url: SERIES_URL, valueIdentifier: { value: value.seriesId } }];
  if (value.context?.laterality) extension.push({ url: LATERALITY_URL, valueCode: value.context.laterality });
  return {
    resourceType: "Observation",
    id: value.id,
    status: value.status ?? "final",
    category: [{ coding: [{ system: OBSERVATION_CATEGORY_SYSTEM, code: "survey", display: "Survey" }] }],
    code: {
      coding: value.code === "custom"
        ? [{ system: SYMPTOM_SYSTEM, code: "custom-symptom", display: name }]
        : [{ system: "http://loinc.org", code: loincCodes[value.code]!, display: name }],
      text: name,
    },
    subject: { reference: `Patient/${value.patientId}` },
    encounter: { reference: `Encounter/${value.visitId}` },
    effectiveDateTime: value.effectiveDateTime,
    performer: [{ reference: `Patient/${value.patientId}` }],
    valueQuantity: { value: value.severity, unit: "score", system: UCUM_SYSTEM, code: "{score}" },
    extension,
    ...(value.context?.bodySite ? { bodySite: { text: value.context.bodySite } } : {}),
    ...(value.context?.note ? { note: [{ text: value.context.note }] } : {}),
  };
}

export function mapFhirClinicalSymptom(resource: FhirClinicalObservation): ClinicalSymptom | null {
  const patientId = extractIdFromReference(resource.subject?.reference);
  const visitId = extractIdFromReference(resource.encounter?.reference);
  const score = resource.valueQuantity?.value;
  if (!resource.id || !patientId || !visitId || !resource.effectiveDateTime || !Number.isInteger(score) || score! < 0 || score! > 10) return null;

  let code: SymptomCode | undefined;
  let name: string | undefined;
  let historicalPain = false;
  const loincCode = resource.code?.coding?.find((coding) => coding.system === "http://loinc.org")?.code;
  if (loincCode) code = symptomCodeForLoinc.get(loincCode);
  const localCoding = resource.code?.coding?.find((coding) => coding.system === SYMPTOM_SYSTEM);
  if (localCoding?.code === "custom-symptom") {
    code = "custom";
    name = resource.code?.text ?? localCoding.display;
  }
  if (getCoding(resource, EVALUATION_SYSTEM, "pain-nrs") || getCoding(resource, LEGACY_SYSTEM, "pain-nrs-0-10")) {
    code = "pain";
    name = "Dolor";
    historicalPain = true;
  }
  if (!code) return null;

  const seriesId = resource.extension?.find((item) => item.url === SERIES_URL)?.valueIdentifier?.value
    ?? (historicalPain ? HISTORIC_PAIN_SERIES : `series-${resource.id}`);
  const laterality = resource.extension?.find((item) => item.url === LATERALITY_URL)?.valueCode;
  const context: ClinicalSymptom["context"] = {
    bodySite: resource.bodySite?.text,
    laterality: laterality === "left" || laterality === "right" || laterality === "bilateral" ? laterality : undefined,
    note: resource.note?.[0]?.text,
  };
  const hasContext = Object.values(context).some(Boolean);
  const clientId = resource.id.replace(/^(?:symptom|evaluation|obs)-/, "");
  return {
    id: resource.id,
    clientId,
    seriesId,
    code,
    ...(code === "custom" && name ? { name } : {}),
    severity: score!,
    patientId,
    visitId,
    effectiveDateTime: resource.effectiveDateTime,
    ...(resource.status !== "final" ? { status: resource.status as ClinicalSymptom["status"] } : {}),
    ...(resource.meta?.versionId ? { version: resource.meta.versionId } : {}),
    ...(hasContext ? { context } : {}),
  };
}
