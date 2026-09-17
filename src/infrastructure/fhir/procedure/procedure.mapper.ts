import type { PerformedProcedure, ProcedureFamily } from "@/domain/visit/clinical-entry";
import { extractIdFromReference } from "@/infrastructure/fhir/core/fhir.references";
import type { FhirResource } from "@/infrastructure/fhir/core/fhir.types";

export const PROCEDURE_SYSTEM = "https://kinesiologiaadomicilio.local/fhir/CodeSystem/performed-procedure-family";
export const PROCEDURE_LABELS: Record<ProcedureFamily, string> = {
  "therapeutic-exercise": "Ejercicio terapéutico", "manual-therapy": "Terapia manual",
  "gait-transfers": "Marcha y transferencias", respiratory: "Intervención respiratoria",
  "education-instructions": "Educación e indicaciones", "environment-assistive-devices": "Entorno y ayudas técnicas", other: "Otro",
};

export interface FhirProcedure extends FhirResource {
  resourceType: "Procedure"; status: string;
  code?: { coding?: Array<{ system?: string; code?: string; display?: string }>; text?: string };
  subject?: { reference?: string }; encounter?: { reference?: string };
  performedPeriod?: { start?: string; end?: string };
}

export function mapPerformedProcedureToFhir(value: PerformedProcedure): FhirProcedure {
  return { resourceType: "Procedure", id: value.id, status: "completed",
    code: { coding: [{ system: PROCEDURE_SYSTEM, code: value.family, display: PROCEDURE_LABELS[value.family] }], text: value.family === "other" ? value.otherName : PROCEDURE_LABELS[value.family] },
    subject: { reference: `Patient/${value.patientId}` }, encounter: { reference: `Encounter/${value.visitId}` },
    performedPeriod: { start: value.performedStart, end: value.performedEnd },
  };
}

export function mapFhirPerformedProcedure(resource: FhirProcedure): PerformedProcedure | null {
  const coding = resource.code?.coding?.find((item) => item.system === PROCEDURE_SYSTEM);
  const patientId = extractIdFromReference(resource.subject?.reference), visitId = extractIdFromReference(resource.encounter?.reference);
  if (!resource.id || !patientId || !visitId || !resource.performedPeriod?.start || !resource.performedPeriod.end || !coding?.code || !(coding.code in PROCEDURE_LABELS)) return null;
  const family = coding.code as ProcedureFamily;
  return { id: resource.id, patientId, visitId, family, ...(family === "other" && resource.code?.text ? { otherName: resource.code.text } : {}), performedStart: resource.performedPeriod.start, performedEnd: resource.performedPeriod.end };
}
