import type { Consultation, ConsultationStatus } from "@/domain/consultation/consultation";
import { isActiveConsultationStatus } from "@/domain/consultation/consultation";
import type { ConsultationRepository } from "@/application/consultations/consultation.repository";
import type { Patient } from "@/domain/patient/patient";
import type { FhirClient } from "@/infrastructure/fhir/core/fhir.client";
import type { AgendaLease } from "@/application/schedule/agenda-coordinator.repository";
import { agendaCoordinatorEntry, refreshAgendaLease } from "@/infrastructure/fhir/appointment/fhir-agenda-coordinator.repository";
import type { FhirBundle } from "@/infrastructure/fhir/core/fhir.types";
import { readAllResourcesByType } from "@/infrastructure/fhir/core/fhir.bundle";
import { FhirClientError } from "@/infrastructure/fhir/core/fhir.errors";
import type { FhirPatient } from "@/infrastructure/fhir/patient/patient.fhir";
import type { EvaluationAppointment } from "@/domain/consultation/consultation-appointment";
import type { InitialEvaluation } from "@/domain/consultation/initial-evaluation";
import type { ClinicalEvaluation, ClinicalSymptom, PerformedProcedure, ProcedureFamily } from "@/domain/visit/clinical-entry";
import { mapClinicalEvaluationToFhir } from "@/infrastructure/fhir/observation/clinical-evaluation.mapper";
import { mapClinicalSymptomToFhir } from "@/infrastructure/fhir/observation/clinical-symptom.mapper";
import { mapPerformedProcedureToFhir } from "@/infrastructure/fhir/procedure/procedure.mapper";
import { treatmentResource } from "@/infrastructure/fhir/administration/fhir-clinical-administration.repository";
import { firstPeriodId } from "@/infrastructure/fhir/periods/fhir-period.repository";
import { mapPeriodToFhir } from "@/infrastructure/fhir/periods/period.mapper";

const BASE = "https://kinesiologiaadomicilio.local/fhir/StructureDefinition/";
const DATA_URL = `${BASE}service-request-consultation-data-v1`;
const ACTIVE_URL = `${BASE}patient-active-consultation-v1`;
const SYSTEM = "https://kinesiologiaadomicilio.local/fhir/NamingSystem/consultation-id-v1";
const CODE_SYSTEM = "https://kinesiologiaadomicilio.local/fhir/CodeSystem/service-request-kind-v1";
const APPOINTMENT_DATA_URL = `${BASE}consultation-evaluation-appointment-data-v1`;
const INITIAL_EVALUATION_DATA_URL = `${BASE}initial-evaluation-data-v1`;
type FhirServiceRequest = {
  resourceType: "ServiceRequest"; id?: string; status?: string; intent?: string;
  code?: { coding?: Array<{ system?: string; code?: string }>; text?: string };
  subject?: { reference?: string }; authoredOn?: string;
  identifier?: Array<{ system?: string; value?: string }>;
  extension?: Array<{ url?: string; valueString?: string }>;
  meta?: { versionId?: string; lastUpdated?: string };
};
type FhirEvaluationAppointment = {
  resourceType: "Appointment"; id?: string; status?: string;
  start?: string; end?: string; minutesDuration?: number; created?: string;
  requestedPeriod?: Array<{ start?: string; end?: string }>;
  participant?: Array<{ actor?: { reference?: string }; status?: string }>;
  supportingInformation?: Array<{ reference?: string }>;
  serviceType?: Array<{ text?: string }>;
  extension?: Array<{ url?: string; valueString?: string }>;
  meta?: { versionId?: string; lastUpdated?: string };
};
type FhirInitialEvaluationEncounter = {
  resourceType: "Encounter"; id?: string; status?: string;
  class?: { system?: string; code?: string };
  subject?: { reference?: string }; appointment?: Array<{ reference?: string }>;
  period?: { start?: string; end?: string }; recorded?: string;
  extension?: Array<{ url?: string; valueString?: string }>;
  meta?: { versionId?: string; lastUpdated?: string };
};

function serializeInitialEvaluation(evaluation: InitialEvaluation): FhirInitialEvaluationEncounter {
  return {
    resourceType: "Encounter", id: evaluation.id, status: "finished",
    class: { system: "http://terminology.hl7.org/CodeSystem/v3-ActCode", code: "HH" },
    subject: { reference: `Patient/${evaluation.patientId}` },
    appointment: evaluation.appointmentId ? [{ reference: `Appointment/${evaluation.appointmentId}` }] : undefined,
    period: { start: evaluation.startedAt, end: evaluation.endedAt }, recorded: evaluation.recordedAt,
    extension: [{ url: INITIAL_EVALUATION_DATA_URL, valueString: JSON.stringify(evaluation) }],
  };
}

function parseInitialEvaluation(resource: FhirInitialEvaluationEncounter): InitialEvaluation | null {
  const raw = resource.extension?.find((item) => item.url === INITIAL_EVALUATION_DATA_URL)?.valueString;
  if (!raw) return null;
  try {
    const evaluation = JSON.parse(raw) as InitialEvaluation;
    return { ...evaluation, version: resource.meta?.versionId };
  } catch { return null; }
}

function initialEvaluationEntryResources(evaluation: InitialEvaluation) {
  const entries: Array<{ resource: unknown; request: { method: "PUT"; url: string } }> = [];
  for (const item of evaluation.clinicalEntries.evaluations) {
    const value: ClinicalEvaluation = { ...item, id: `evaluation-${item.clientId}`, patientId: evaluation.patientId, visitId: evaluation.id, effectiveDateTime: evaluation.startedAt };
    entries.push({ resource: mapClinicalEvaluationToFhir(value), request: { method: "PUT", url: `Observation/${value.id}` } });
  }
  for (const item of evaluation.clinicalEntries.symptoms) {
    const value: ClinicalSymptom = { ...item, id: `symptom-${item.clientId}`, patientId: evaluation.patientId, visitId: evaluation.id, effectiveDateTime: evaluation.startedAt };
    entries.push({ resource: mapClinicalSymptomToFhir(value), request: { method: "PUT", url: `Observation/${value.id}` } });
  }
  const procedureSuffix: Record<ProcedureFamily, string> = { "therapeutic-exercise": "exercise", "manual-therapy": "manual", "gait-transfers": "gait", respiratory: "resp", "education-instructions": "education", "environment-assistive-devices": "environment", other: "other" };
  for (const item of evaluation.clinicalEntries.procedures) {
    const value: PerformedProcedure = { ...item, id: `proc-${evaluation.id.replace(/^initial-evaluation-/, "").slice(0, 36)}-${procedureSuffix[item.family]}`.slice(0, 64), patientId: evaluation.patientId, visitId: evaluation.id, performedStart: evaluation.startedAt, performedEnd: evaluation.endedAt };
    entries.push({ resource: mapPerformedProcedureToFhir(value), request: { method: "PUT", url: `Procedure/${value.id}` } });
  }
  return entries;
}

function serializeEvaluationAppointment(appointment: EvaluationAppointment): FhirEvaluationAppointment {
  return {
    resourceType: "Appointment", id: appointment.id,
    status: appointment.status === "not-performed" ? "noshow" : appointment.status === "realized" ? "fulfilled" : appointment.status === "confirmed" ? "booked" : appointment.status,
    ...(appointment.startsAt ? { start: appointment.startsAt, end: appointment.endsAt, minutesDuration: appointment.durationMinutes } : {
      requestedPeriod: [{ start: `${appointment.scheduledDate}T00:00:00-03:00`, end: `${appointment.scheduledDate}T23:59:59-03:00` }],
    }),
    created: appointment.createdAt,
    participant: [{ actor: { reference: `Patient/${appointment.patientId}` }, status: "accepted" }],
    supportingInformation: [{ reference: `ServiceRequest/${appointment.consultationId}` }],
    serviceType: [{ text: "Evaluación inicial de kinesiología" }],
    extension: [{ url: APPOINTMENT_DATA_URL, valueString: JSON.stringify(appointment) }],
  };
}

function parseEvaluationAppointment(resource: FhirEvaluationAppointment): EvaluationAppointment | null {
  const raw = resource.extension?.find((item) => item.url === APPOINTMENT_DATA_URL)?.valueString;
  if (!raw) return null;
  try {
    const appointment = JSON.parse(raw) as EvaluationAppointment;
    return { ...appointment, version: resource.meta?.versionId };
  } catch { return null; }
}

export class ConsultationConflictError extends Error {}
function sameRequest(saved: Consultation, attempted: Consultation, existingPatient: FhirPatient, attemptedPatient: Patient) {
  const savedName = existingPatient.name?.[0];
  return saved.patientId === attempted.patientId &&
    (savedName?.given ?? []).join(" ") === attemptedPatient.givenName && (savedName?.family ?? "") === attemptedPatient.familyName &&
    existingPatient.telecom?.find((item) => item.system === "phone")?.value === attemptedPatient.phone &&
    existingPatient.address?.[0]?.text === attemptedPatient.address &&
    JSON.stringify(saved.initialContext) === JSON.stringify(attempted.initialContext) &&
    JSON.stringify(saved.contacts) === JSON.stringify(attempted.contacts) &&
    JSON.stringify(saved.followUps.map(({ id, dueAt }) => ({ id, dueAt }))) === JSON.stringify(attempted.followUps.map(({ id, dueAt }) => ({ id, dueAt }))) &&
    saved.noticesAndConsents.map((item) => `${item.kind}:${item.subjectContactId}:${item.scope}`).join("|") === attempted.noticesAndConsents.map((item) => `${item.kind}:${item.subjectContactId}:${item.scope}`).join("|");
}
function fhirStatus(status: ConsultationStatus) {
  return status === "closed" || status === "treatment-started" ? "completed" : "active";
}
function serialize(consultation: Consultation): FhirServiceRequest {
  return {
    resourceType: "ServiceRequest", id: consultation.id, status: fhirStatus(consultation.status), intent: "order",
    code: { coding: [{ system: CODE_SYSTEM, code: "intake-consultation" }], text: "Consulta de ingreso" },
    subject: { reference: `Patient/${consultation.patientId}` }, authoredOn: consultation.createdAt,
    identifier: [{ system: SYSTEM, value: consultation.id }],
    extension: [{ url: DATA_URL, valueString: JSON.stringify(consultation) }],
  };
}
function parse(resource: FhirServiceRequest): Consultation | null {
  const raw = resource.extension?.find((extension) => extension.url === DATA_URL)?.valueString;
  if (!raw) return null;
  try {
    const consultation = JSON.parse(raw) as Consultation;
    return { ...consultation, version: resource.meta?.versionId, updatedAt: resource.meta?.lastUpdated };
  } catch { return null; }
}
function patientExtensions(patient: FhirPatient, activeConsultationId?: string) {
  const extensions = (patient.extension ?? []).filter((item) => item.url !== ACTIVE_URL);
  if (activeConsultationId) extensions.push({ url: ACTIVE_URL, valueString: activeConsultationId });
  return extensions.length ? extensions : undefined;
}
function lockedPatient(patient: FhirPatient, activeConsultationId?: string): FhirPatient {
  return { ...patient, extension: patientExtensions(patient, activeConsultationId) };
}
function patientResource(patient: Patient): FhirPatient {
  return {
    resourceType: "Patient", id: patient.id,
    name: patient.givenName || patient.familyName ? [{ given: patient.givenName ? [patient.givenName] : [], family: patient.familyName || undefined }] : undefined,
    telecom: patient.phone ? [{ system: "phone", value: patient.phone }] : undefined,
    address: patient.address ? [{ text: patient.address }] : undefined,
    extension: patient.accessInstructions ? [{ url: `${BASE}patient-home-access-instructions-v1`, valueString: patient.accessInstructions }] : undefined,
  };
}

export function createFhirConsultationRepository(client: FhirClient): ConsultationRepository {
  async function getOptionalConsultation(id: string): Promise<FhirServiceRequest | null> {
    try { return await client.get<FhirServiceRequest>(`ServiceRequest/${id}`); }
    catch (error) { if (error instanceof FhirClientError && error.status === 404) return null; throw error; }
  }
  async function getPatient(id: string): Promise<FhirPatient> {
    try { return await client.get<FhirPatient>(`Patient/${id}`); }
    catch (error) {
      if (!(error instanceof FhirClientError) || error.status !== 404) throw error;
      throw new ConsultationConflictError("La ficha ya no está disponible.");
    }
  }
  async function persistWithLock(patient: FhirPatient, consultation: Consultation, expectedConsultationVersion?: string, appointments: EvaluationAppointment[] = [], evaluation?: InitialEvaluation, extraEntries: Array<{ resource: unknown; request: { method: "PUT"; url: string; ifMatch?: string } }> = [], agendaLease?: AgendaLease) {
    if (!patient.meta?.versionId) throw new ConsultationConflictError("El registro clínico no informa una versión verificable; no se guardó la consulta.");
    const activeId = patient.extension?.find((item) => item.url === ACTIVE_URL)?.valueString;
    const current = activeId ? await getOptionalConsultation(activeId) : null;
    if (activeId && !current) throw new ConsultationConflictError("No se pudo verificar la consulta activa. Recargá antes de continuar.");
    if (current && isActiveConsultationStatus(parse(current)?.status ?? "closed")) {
      if (current.id !== consultation.id) throw new ConsultationConflictError("Este paciente ya tiene una consulta de ingreso abierta.");
      if (expectedConsultationVersion && current.meta?.versionId !== expectedConsultationVersion) throw new ConsultationConflictError("La consulta cambió en otro dispositivo. Recargá la pantalla.");
    } else if (expectedConsultationVersion) {
      throw new ConsultationConflictError("La consulta ya no está disponible para modificar.");
    }

    const coordinator = agendaLease ? await agendaCoordinatorEntry(client, agendaLease) : undefined;
    const entries = [
      ...(coordinator ? [coordinator] : []),
      { resource: lockedPatient(patient, isActiveConsultationStatus(consultation.status) ? consultation.id : undefined), request: { method: "PUT", url: `Patient/${patient.id}`, ifMatch: `W/\"${patient.meta?.versionId ?? "0"}\"` } },
      { resource: serialize(consultation), request: { method: "PUT", url: `ServiceRequest/${consultation.id}`, ...(expectedConsultationVersion ? { ifMatch: `W/\"${expectedConsultationVersion}\"` } : {}) } },
      ...appointments.map((appointment) => ({ resource: serializeEvaluationAppointment(appointment), request: { method: "PUT" as const, url: `Appointment/${appointment.id}`, ...(appointment.version ? { ifMatch: `W/\"${appointment.version}\"` } : {}) } })),
      ...(evaluation ? [{ resource: serializeInitialEvaluation(evaluation), request: { method: "PUT" as const, url: `Encounter/${evaluation.id}`, ifNoneMatch: "*" } }, ...initialEvaluationEntryResources(evaluation)] : []),
      ...extraEntries,
    ];
    try { await client.transaction<FhirBundle>({ resourceType: "Bundle", type: "transaction", entry: entries }); }
    catch (error) {
      if (error instanceof FhirClientError && (error.status === 409 || error.status === 412)) throw new ConsultationConflictError("La consulta o la ficha cambió en otro dispositivo. Recargá la pantalla.");
      throw error;
    }
    if (agendaLease) await refreshAgendaLease(client, agendaLease);
    const saved = await client.get<FhirServiceRequest>(`ServiceRequest/${consultation.id}`);
    const parsed = parse(saved);
    if (!parsed) throw new Error("No se pudo confirmar la consulta guardada.");
    return parsed;
  }
  return {
    async create({ consultation, patient }) {
      let rawPatient: FhirPatient;
      try { rawPatient = await client.get<FhirPatient>(`Patient/${patient.id}`); }
      catch (error) {
        if (!(error instanceof FhirClientError) || error.status !== 404) throw error;
        await client.put(`Patient/${patient.id}`, patientResource(patient));
        rawPatient = await getPatient(patient.id);
      }
      if (rawPatient.extension?.some((item) => item.url === ACTIVE_URL)) {
        const currentId = rawPatient.extension.find((item) => item.url === ACTIVE_URL)?.valueString;
        const current = currentId ? await getOptionalConsultation(currentId) : null;
        if (currentId && !current) throw new ConsultationConflictError("No se pudo verificar la consulta activa. Recargá antes de continuar.");
        const currentConsultation = current ? parse(current) : null;
        if (currentConsultation && isActiveConsultationStatus(currentConsultation.status)) {
          if (currentConsultation.id === consultation.id) {
            if (!sameRequest(currentConsultation, consultation, rawPatient, patient)) throw new ConsultationConflictError("La misma operación se reintentó con datos diferentes.");
            return currentConsultation;
          }
          throw new ConsultationConflictError("Este paciente ya tiene una consulta de ingreso abierta.");
        }
      }
      return persistWithLock(rawPatient, consultation);
    },
    async getById(id) {
      try { const result = parse(await client.get<FhirServiceRequest>(`ServiceRequest/${id}`)); return result; }
      catch (error) { if (error instanceof FhirClientError && error.status === 404) return null; throw error; }
    },
    async save(consultation, expectedVersion) {
      const patient = await getPatient(consultation.patientId);
      return persistWithLock(patient, consultation, expectedVersion);
    },
    async saveWithEvaluationAppointments({ consultation, appointments, expectedVersion, agendaLease }) {
      if (appointments.some((item) => item.patientId !== consultation.patientId || item.consultationId !== consultation.id || !consultation.appointmentIds.includes(item.id))) {
        throw new ConsultationConflictError("La cita de evaluación no coincide con la consulta o el paciente.");
      }
      const patient = await getPatient(consultation.patientId);
      const saved = await persistWithLock(patient, consultation, expectedVersion, appointments, undefined, [], agendaLease);
      for (const appointment of appointments) {
        const confirmed = parseEvaluationAppointment(await client.get<FhirEvaluationAppointment>(`Appointment/${appointment.id}`));
        if (!confirmed || confirmed.status !== appointment.status || confirmed.consultationId !== consultation.id) throw new Error("La cita de evaluación todavía no pudo confirmarse.");
      }
      return saved;
    },
    async getEvaluationAppointment(id) {
      try { return parseEvaluationAppointment(await client.get<FhirEvaluationAppointment>(`Appointment/${id}`)); }
      catch (error) { if (error instanceof FhirClientError && error.status === 404) return null; throw error; }
    },
    async listOpenEvaluationAppointments() {
      const resources = await readAllResourcesByType<FhirEvaluationAppointment>({
        client, path: `Appointment?${new URLSearchParams({ status: "booked", _count: "200" })}`, resourceType: "Appointment",
      });
      return resources.flatMap((resource) => {
        const parsed = parseEvaluationAppointment(resource);
        return parsed?.status === "confirmed" ? [parsed] : [];
      });
    },
    async completeInitialEvaluation({ consultation, appointment, evaluation, expectedVersion }) {
      if (evaluation.consultationId !== consultation.id || evaluation.patientId !== consultation.patientId || evaluation.appointmentId !== appointment?.id || (appointment && (appointment.consultationId !== consultation.id || appointment.patientId !== consultation.patientId || !consultation.appointmentIds.includes(appointment.id)))) {
        throw new ConsultationConflictError("La evaluación no coincide con su consulta, cita o paciente.");
      }
      const patient = await getPatient(consultation.patientId);
      const saved = await persistWithLock(patient, consultation, expectedVersion, appointment ? [appointment] : [], evaluation);
      const confirmed = parseInitialEvaluation(await client.get<FhirInitialEvaluationEncounter>(`Encounter/${evaluation.id}`));
      if (!confirmed || confirmed.assessment !== evaluation.assessment || confirmed.appointmentId !== appointment?.id) throw new Error("La evaluación todavía no pudo confirmarse.");
      await Promise.all(initialEvaluationEntryResources(evaluation).map((entry) => client.get(entry.request.url)));
      return saved;
    },
    async getInitialEvaluation(id) {
      try { return parseInitialEvaluation(await client.get<FhirInitialEvaluationEncounter>(`Encounter/${id}`)); }
      catch (error) { if (error instanceof FhirClientError && error.status === 404) return null; throw error; }
    },
    async startTreatmentFromConsultation({ consultation, treatment, diagnoses, expectedVersion }) {
      if (consultation.patientId !== treatment.patientId || consultation.status !== "treatment-started") {
        throw new ConsultationConflictError("El tratamiento no coincide con la consulta y su período inicial.");
      }
      const patient = await getPatient(consultation.patientId);
      const firstPeriod = { id: firstPeriodId(treatment.id), treatmentId: treatment.id, patientId: treatment.patientId, ordinal: 1, quota: treatment.plannedSessionCount, frequency: treatment.plannedFrequency, phase: "open" as const, available: true, clinicalRevision: 0 };
      const episode = treatmentResource({ ...treatment, currentPeriodId: firstPeriod.id });
      const entries: Array<{ resource: unknown; request: { method: "PUT"; url: string; ifMatch?: string } }> = [
        { resource: episode, request: { method: "PUT", url: `EpisodeOfCare/${treatment.id}` } },
        { resource: mapPeriodToFhir(firstPeriod), request: { method: "PUT", url: `CarePlan/${firstPeriod.id}` } },
        ...diagnoses.map((item) => ({ resource: { resourceType: "Condition", id: item.id, subject: { reference: `Patient/${item.patientId}` }, code: { text: item.text }, recordedDate: item.recordedAt }, request: { method: "PUT" as const, url: `Condition/${item.id}` } })),
      ];
      const saved = await persistWithLock(patient, consultation, expectedVersion, [], undefined, entries);
      const confirmed = await client.get<{ resourceType: string; id?: string }>(`EpisodeOfCare/${treatment.id}`);
      const period = await client.get<{ resourceType: string; id?: string }>(`CarePlan/${firstPeriod.id}`);
      if (confirmed.resourceType !== "EpisodeOfCare" || period.resourceType !== "CarePlan") throw new Error("El inicio del tratamiento todavía no pudo confirmarse.");
      return saved;
    },
    async listActive() {
      const resources = await readAllResourcesByType<FhirServiceRequest>({ client, path: "ServiceRequest?status=active&_count=200", resourceType: "ServiceRequest" });
      return resources.flatMap(resource => { const value = parse(resource); return value && isActiveConsultationStatus(value.status) ? [value] : []; });
    },
    async listByPatientId(patientId) {
      const bundle = await client.get<FhirBundle>(`ServiceRequest?subject=Patient%2F${encodeURIComponent(patientId)}&_count=200`);
      return (bundle.entry ?? []).flatMap((entry) => {
        const value = entry.resource as FhirServiceRequest | undefined;
        const parsed = value?.resourceType === "ServiceRequest" ? parse(value) : null;
        return parsed ? [parsed] : [];
      });
    },
  };
}
