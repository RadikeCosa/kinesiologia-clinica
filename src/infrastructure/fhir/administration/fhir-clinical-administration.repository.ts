import { createFhirPeriodRepository, firstPeriodId } from "../periods/fhir-period.repository";
import { mapPeriodToFhir, periodEntry } from "../periods/period.mapper";
import { createFhirTreatmentRepository } from "../episode-of-care/fhir-treatment.repository";
import { createFhirVisitRepository } from "../encounter/fhir-visit.repository";
import { reconcilePeriod, validQuota, periodCount, PeriodStateError } from "@/domain/treatment-period/treatment-period";
import type { ClinicalAdministrationRepository } from "@/application/administration/clinical-administration.repository";
import type { Diagnosis } from "@/domain/condition/condition";
import type { Patient } from "@/domain/patient/patient";
import type { Treatment } from "@/domain/treatment/treatment";
import type { FhirResource } from "../core/fhir.types";
import type { FhirClient } from "@/infrastructure/fhir/core/fhir.client";

const BASE = "https://kinesiologiaadomicilio.local/fhir/StructureDefinition/";
const ROLE_SYSTEM = "https://kinesiologiaadomicilio.local/fhir/CodeSystem/episodeofcare-diagnosis-role-v1";

function version(value?: string) { return value ? `W/\"${value}\"` : undefined; }
function patientResource(patient: Patient) {
  const extension = [
    ...(patient.accessInstructions ? [{ url: `${BASE}patient-home-access-instructions-v1`, valueString: patient.accessInstructions }] : []),
    ...(patient.activeConsultationId ? [{ url: `${BASE}patient-active-consultation-v1`, valueString: patient.activeConsultationId }] : []),
  ];
  return { resourceType: "Patient", id: patient.id, name: patient.givenName || patient.familyName ? [{ given: patient.givenName ? [patient.givenName] : [], family: patient.familyName || undefined }] : undefined, telecom: patient.phone ? [{ system: "phone", value: patient.phone }] : undefined, address: patient.address ? [{ text: patient.address }] : undefined, extension: extension.length ? extension : undefined };
}
function conditionResource(value: Diagnosis) { return { resourceType: "Condition", id: value.id, subject: { reference: `Patient/${value.patientId}` }, code: { text: value.text }, recordedDate: value.recordedAt }; }
export function treatmentResource(treatment: Treatment) {
  const extensions: unknown[] = [];
  if (treatment.currentPeriodId) extensions.push({ url: `${BASE}episodeofcare-current-period-v1`, valueString: treatment.currentPeriodId });
  if (treatment.sourceConsultationId) extensions.push({ url: `${BASE}treatment-origin-consultation-v1`, valueReference: { reference: `ServiceRequest/${treatment.sourceConsultationId}` } });
  if (treatment.initialEvaluationId) extensions.push({ url: `${BASE}treatment-initial-evaluation-v1`, valueReference: { reference: `Encounter/${treatment.initialEvaluationId}` } });
  if (treatment.acceptedTreatmentQuoteId) extensions.push({ url: `${BASE}treatment-accepted-budget-v1`, valueString: treatment.acceptedTreatmentQuoteId });
  extensions.push({ url: `${BASE}episodeofcare-metadata-revision-v1`, valueInteger: treatment.metadataRevision ?? 0 });
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
  const periods = createFhirPeriodRepository(client), treatments = createFhirTreatmentRepository(client), visits = createFhirVisitRepository(client);
  async function patientEntry(patientId: string, expectedVersion: string) {
    if (!expectedVersion) throw new PeriodStateError("Falta la versión del paciente. Recargá la pantalla.");
    const patient = await client.get<FhirResource>(`Patient/${patientId}`);
    if (patient.meta?.versionId !== expectedVersion) throw new PeriodStateError("La ficha cambió. Recargá la pantalla.");
    const coordinated = patient as FhirResource & { extension?: Array<{ url: string; valueString?: string }> };
    const url = `${BASE}patient-treatment-coordination-v1`;
    return entry({ ...patient, extension: [...(coordinated.extension ?? []).filter(e => e.url !== url), { url, valueString: expectedVersion }] }, `Patient/${patientId}`, expectedVersion);
  }
  return {
    async putPatient(patient, expectedVersion) {
      const linked = expectedVersion ? await treatments.listByPatientId!(patient.id) : [];
      await client.transaction({ resourceType: "Bundle", type: "transaction", entry: [entry(patientResource(patient), `Patient/${patient.id}`, expectedVersion), ...linked.map(t => entry(treatmentResource({ ...t, metadataRevision: (t.metadataRevision ?? 0) + 1 }), `EpisodeOfCare/${t.id}`, t.version))] });
    },
    async startTreatment(treatment, diagnoses, expectedPatientVersion) {
      const patient = await patientEntry(treatment.patientId, expectedPatientVersion);
      const period = { id: firstPeriodId(treatment.id), patientId: treatment.patientId, treatmentId: treatment.id, ordinal: 1, quota: treatment.plannedSessionCount, frequency: treatment.plannedFrequency, phase: "open" as const, available: true, clinicalRevision: 0 };
      await client.transaction({ resourceType: "Bundle", type: "transaction", entry: [patient, ...diagnoses.map(item => entry(conditionResource(item), `Condition/${item.id}`)), entry(treatmentResource({ ...treatment, currentPeriodId: period.id }), `EpisodeOfCare/${treatment.id}`), entry(mapPeriodToFhir(period), `CarePlan/${period.id}`)] });
    },
    async putTreatment(treatment, diagnoses, expectedVersion, expectedPatientVersion) {
      const current = await treatments.getById(treatment.id);
      if (!current || current.version !== expectedVersion) throw new PeriodStateError("El tratamiento cambió. Recargá la pantalla.");
      const reactivating = treatment.status === "active" && current.status !== "active";
      if (reactivating && !expectedPatientVersion) throw new PeriodStateError("Falta la versión del paciente. Recargá la pantalla.");
      const patient = reactivating ? await patientEntry(treatment.patientId, expectedPatientVersion!) : undefined;
      // Materialization is a separate guarded transaction, so refresh its new treatment version.
      let period = await periods.current(current);
      if (!period.version) {
        await periods.materialize(current);
        const refreshed = await treatments.getById(current.id);
        if (!refreshed || (refreshed.metadataRevision ?? 0) !== (current.metadataRevision ?? 0) || refreshed.currentPeriodId !== period.id) throw new PeriodStateError("El tratamiento cambió mientras se preparaba su período. Recargá la pantalla.");
        expectedVersion = refreshed.version;
        treatment = { ...treatment, currentPeriodId: refreshed.currentPeriodId };
        period = await periods.current(refreshed);
      }
      const allVisits = await visits.listByPatientId(current.patientId);
      const count = periodCount(period, allVisits);
      period = reconcilePeriod(period, allVisits);
      if ((treatment.plannedSessionCount !== period.quota || treatment.plannedFrequency !== period.frequency) && (period.phase !== "open" || validQuota(period.quota) && count.completed + count.reserved >= period.quota || validQuota(period.quota) && (treatment.plannedSessionCount ?? 0) < count.completed + count.reserved)) throw new PeriodStateError("No se puede modificar el cupo de un período completo ni informado.");
      if (treatment.status === "finished" && current.status !== "finished") throw new PeriodStateError("Finalizá desde el período con su informe actualizado.");
      if (treatment.status !== "active" && count.reserved) throw new PeriodStateError("Primero resolvé la visita en curso.");
      period = reconcilePeriod({ ...period, quota: treatment.plannedSessionCount, frequency: treatment.plannedFrequency, available: treatment.status === "active", clinicalRevision: period.clinicalRevision + 1 }, allVisits);
      await client.transaction({ resourceType: "Bundle", type: "transaction", entry: [...(patient ? [patient] : []), ...diagnoses.map(item => entry(conditionResource(item), `Condition/${item.id}`)), entry(treatmentResource({ ...treatment, currentPeriodId: period.id }), `EpisodeOfCare/${treatment.id}`, expectedVersion), periodEntry(period)] });
    },
  };
}
