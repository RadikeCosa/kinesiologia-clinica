import type { ClinicalAdministrationRepository } from "@/application/administration/clinical-administration.repository";
import type { Diagnosis } from "@/domain/condition/condition";
import type { Patient } from "@/domain/patient/patient";
import type { Treatment } from "@/domain/treatment/treatment";
import type { FhirClient } from "@/infrastructure/fhir/core/fhir.client";

const BASE = "https://kinesiologiaadomicilio.local/fhir/StructureDefinition/";
const ROLE_SYSTEM = "https://kinesiologiaadomicilio.local/fhir/CodeSystem/episodeofcare-diagnosis-role-v1";

function version(value?: string) { return value ? `W/\"${value}\"` : undefined; }
function patientResource(patient: Patient) {
  return { resourceType: "Patient", id: patient.id, name: [{ given: [patient.givenName], family: patient.familyName }], telecom: [{ system: "phone", value: patient.phone }], address: [{ text: patient.address }], extension: patient.accessInstructions ? [{ url: `${BASE}patient-home-access-instructions-v1`, valueString: patient.accessInstructions }] : undefined };
}
function conditionResource(value: Diagnosis) { return { resourceType: "Condition", id: value.id, subject: { reference: `Patient/${value.patientId}` }, code: { text: value.text }, recordedDate: value.recordedAt }; }
function treatmentResource(treatment: Treatment) {
  const extensions: unknown[] = [];
  if (treatment.clinicalContext?.initialFunctionalStatus) extensions.push({ url: `${BASE}episodeofcare-initial-functional-status-v1`, valueString: treatment.clinicalContext.initialFunctionalStatus });
  if (treatment.clinicalContext?.therapeuticGoals) extensions.push({ url: `${BASE}episodeofcare-therapeutic-goals-v1`, valueString: treatment.clinicalContext.therapeuticGoals });
  if (treatment.clinicalContext?.frameworkPlan) extensions.push({ url: `${BASE}episodeofcare-framework-plan-v1`, valueString: treatment.clinicalContext.frameworkPlan });
  if (treatment.plannedFrequency) extensions.push({ url: `${BASE}episodeofcare-planned-frequency-v1`, valueString: treatment.plannedFrequency });
  if (treatment.plannedSessionCount) extensions.push({ url: `${BASE}episodeofcare-planned-session-count-v1`, valuePositiveInt: treatment.plannedSessionCount });
  for (const precaution of treatment.precautions ?? []) extensions.push({ url: `${BASE}episodeofcare-precaution-v1`, valueString: precaution });
  for (const item of treatment.statusHistory ?? []) if (item.note) extensions.push({ url: `${BASE}episodeofcare-status-change-v1`, extension: [{ url: "status", valueCode: item.status === "paused" ? "onhold" : item.status }, { url: "at", valueDateTime: item.startedAt }, { url: "note", valueString: item.note }] });
  return { resourceType: "EpisodeOfCare", id: treatment.id, status: treatment.status === "paused" ? "onhold" : treatment.status, patient: { reference: `Patient/${treatment.patientId}` }, period: { start: treatment.startDate, end: treatment.endDate }, extension: extensions.length ? extensions : undefined, statusHistory: treatment.statusHistory?.map((item) => ({ status: item.status === "paused" ? "onhold" : item.status, period: { start: item.startedAt, end: item.endedAt } })), diagnosis: treatment.diagnosisReferences?.map((item) => ({ condition: { reference: `Condition/${item.conditionId}` }, role: { coding: [{ system: ROLE_SYSTEM, code: item.kind }] } })) };
}
function entry(resource: unknown, url: string, expectedVersion?: string) { return { resource, request: { method: "PUT", url, ...(version(expectedVersion) ? { ifMatch: version(expectedVersion) } : {}) } }; }
export function createFhirClinicalAdministrationRepository(client: FhirClient): ClinicalAdministrationRepository {
  return {
    putPatient: async (patient, expectedVersion) => { await client.transaction({ resourceType: "Bundle", type: "transaction", entry: [entry(patientResource(patient), `Patient/${patient.id}`, expectedVersion)] }); },
    startTreatment: async (treatment, diagnoses) => { await client.transaction({ resourceType: "Bundle", type: "transaction", entry: [...diagnoses.map((item) => entry(conditionResource(item), `Condition/${item.id}`)), entry(treatmentResource(treatment), `EpisodeOfCare/${treatment.id}`)] }); },
    putTreatment: async (treatment, diagnoses, expectedVersion) => { await client.transaction({ resourceType: "Bundle", type: "transaction", entry: [...diagnoses.map((item) => entry(conditionResource(item), `Condition/${item.id}`)), entry(treatmentResource(treatment), `EpisodeOfCare/${treatment.id}`, expectedVersion)] }); },
  };
}
