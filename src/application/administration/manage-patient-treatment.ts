import { changePeriod, type PeriodDependencies } from "../periods/manage-periods";
import { periodCount, reconcilePeriod, validQuota } from "@/domain/treatment-period/treatment-period";
import type { PeriodRepository } from "../periods/period.repository";
import type { VisitRepository } from "../visits/visit.repository";
import { z } from "zod";
import type { ClinicalAdministrationRepository } from "./clinical-administration.repository";
import type { PatientRepository } from "@/application/patients/patient.repository";
import type { TreatmentRepository } from "@/application/treatments/treatment.repository";
import type { ScheduledVisitRepository } from "@/application/schedule/scheduled-visit.repository";
import type { Patient } from "@/domain/patient/patient";
import type { Treatment } from "@/domain/treatment/treatment";

const id = z.string().uuid();
const text = z.string().trim().min(1).max(240);
const optionalText = z.string().trim().max(2000).optional().transform((value) => value || undefined);
export const patientInputSchema = z.object({ clientId: id, givenName: text, familyName: text, phone: text, address: text, accessInstructions: optionalText });
export const treatmentInputSchema = z.object({ clientId: id, patientId: z.string().min(1), startDate: z.iso.date(), plannedSessionCount: z.coerce.number().int().min(1).max(500), plannedFrequency: text, initialFunctionalStatus: optionalText, therapeuticGoals: optionalText, frameworkPlan: optionalText, precautions: z.array(z.string().trim().min(1).max(300)).max(20).default([]), diagnoses: z.array(z.object({ clientId: id, text, kind: z.enum(["medical_reference", "kinesiologic_diagnosis"]) })).max(20).default([]) });

export class AdministrationStateError extends Error {}
type Dependencies = { periodFlow?: PeriodDependencies; periods?: PeriodRepository; visits?: VisitRepository; patients: PatientRepository; treatments: TreatmentRepository; scheduledVisits: ScheduledVisitRepository; administration: ClinicalAdministrationRepository; clock?: { now(): Date } };
function day(now: Date) { return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires", year: "numeric", month: "2-digit", day: "2-digit" }).format(now); }
function normalizePhone(value: string) { return value.replace(/\D/g, ""); }
function clientId(prefix: string, raw: string) { return `${prefix}-${raw}`; }

export async function possiblePhoneMatch(phone: string, dependencies: Pick<Dependencies, "patients">) {
  const normalized = normalizePhone(phone);
  if (!normalized) return null;
  return ((dependencies.patients.listAll ? await dependencies.patients.listAll() : [])).find((patient) => normalizePhone(patient.phone ?? "") === normalized) ?? null;
}

export async function createPatient(raw: unknown, dependencies: Dependencies) {
  const input = patientInputSchema.parse(raw);
  const patient: Patient = { id: clientId("patient", input.clientId), givenName: input.givenName, familyName: input.familyName, phone: input.phone, address: input.address, accessInstructions: input.accessInstructions };
  const existing = await dependencies.patients.getById(patient.id);
  if (existing) {
    if (JSON.stringify({ ...existing, version: undefined, updatedAt: undefined }) === JSON.stringify(patient)) return existing;
    throw new AdministrationStateError("La operación se reintentó con datos diferentes.");
  }
  await dependencies.administration.putPatient(patient);
  return patient;
}

export async function updatePatient(raw: unknown, expectedVersion: string | undefined, dependencies: Dependencies) {
  const input = z.object({ clientId: z.string().min(1).max(64), givenName: text, familyName: text, phone: text, address: text, accessInstructions: optionalText }).parse(raw);
  const current = await dependencies.patients.getById(input.clientId);
  if (!current) throw new AdministrationStateError("La ficha ya no está disponible.");
  if (current.version !== expectedVersion) throw new AdministrationStateError("La ficha cambió en otro dispositivo. Recargá la pantalla.");
  const patient: Patient = { ...current, givenName: input.givenName, familyName: input.familyName, phone: input.phone, address: input.address, accessInstructions: input.accessInstructions };
  await dependencies.administration.putPatient(patient, current.version);
  return patient;
}

export async function beginTreatment(raw: unknown, dependencies: Dependencies) {
  const input = treatmentInputSchema.parse(raw);
  const now = (dependencies.clock?.now() ?? new Date());
  if (input.startDate > day(now)) throw new AdministrationStateError("La fecha de inicio no puede ser futura.");
  const patient = await dependencies.patients.getById(input.patientId);
  if (!patient) throw new AdministrationStateError("La ficha del paciente ya no está disponible.");
  if (patient.activeConsultationId) throw new AdministrationStateError("Esta ficha tiene una consulta de ingreso abierta. Completá su evaluación y aceptación antes de iniciar el tratamiento.");
  const existing = await dependencies.treatments.getById(clientId("treatment", input.clientId));
  if (existing) {
    if (existing.patientId === patient.id) return existing;
    throw new AdministrationStateError("La operación se reintentó con datos diferentes.");
  }
  const active = (dependencies.treatments.listByPatientId ? await dependencies.treatments.listByPatientId(patient.id) : (await dependencies.treatments.listDirectory()).filter((item) => item.patientId === patient.id)).find((item) => item.status === "active");
  if (active) throw new AdministrationStateError("Este paciente ya tiene un tratamiento activo.");
  const treatment: Treatment = { id: clientId("treatment", input.clientId), patientId: patient.id, status: "active", startDate: input.startDate, plannedSessionCount: input.plannedSessionCount, plannedFrequency: input.plannedFrequency, clinicalContext: { initialFunctionalStatus: input.initialFunctionalStatus, therapeuticGoals: input.therapeuticGoals, frameworkPlan: input.frameworkPlan }, precautions: input.precautions, diagnosisReferences: input.diagnoses.map((item) => ({ kind: item.kind, conditionId: clientId("condition", item.clientId) })), statusHistory: [{ status: "active", startedAt: now.toISOString() }] };
  await dependencies.administration.startTreatment(treatment, input.diagnoses.map((item) => ({ id: clientId("condition", item.clientId), patientId: patient.id, text: item.text, recordedAt: now.toISOString() })));
  return treatment;
}

export async function updateTreatment(raw: unknown, expectedVersion: string | undefined, dependencies: Dependencies) {
  const values = raw as Record<string, unknown>;
  const input = z.object({ patientId: z.string().min(1), clientId: z.string().min(1), startDate: z.iso.date(), plannedSessionCount: z.coerce.number().int().min(1).max(500), plannedFrequency: text, initialFunctionalStatus: optionalText, therapeuticGoals: optionalText, frameworkPlan: optionalText, precautions: z.array(z.string().trim().min(1).max(300)).max(20).default([]), diagnoses: z.array(z.object({ clientId: z.string().trim().min(1).max(128), text, kind: z.enum(["medical_reference", "kinesiologic_diagnosis"]) })).max(20).default([]) }).parse(values);
  const treatmentId = typeof values.treatmentId === "string" ? values.treatmentId : "";
  const current = await dependencies.treatments.getById(treatmentId);
  if (!current) throw new AdministrationStateError("El tratamiento ya no está disponible.");
  if (current.version !== expectedVersion) throw new AdministrationStateError("El tratamiento cambió en otro dispositivo. Recargá la pantalla.");
  if (current.patientId !== input.patientId) throw new AdministrationStateError("El tratamiento no pertenece a este paciente.");
  if (dependencies.periods && dependencies.visits) {
    const period = reconcilePeriod(await dependencies.periods.current(current), await dependencies.visits.listByPatientId(current.patientId));
    const count = periodCount(period, await dependencies.visits.listByPatientId(current.patientId));
    if ((input.plannedSessionCount !== period.quota || input.plannedFrequency !== period.frequency) && (period.phase !== "open" || validQuota(period.quota) && count.completed + count.reserved >= period.quota || validQuota(period.quota) && input.plannedSessionCount < count.completed + count.reserved)) throw new AdministrationStateError("El cupo y la frecuencia se cambian en un período abierto o al renovar; no pueden eludir el informe.");
  }
  const conditionId = (value: string) => value.startsWith("condition-") || value.startsWith("demo-") ? value : clientId("condition", value);
  const treatment: Treatment = { ...current, metadataRevision: (current.metadataRevision ?? 0) + 1, plannedSessionCount: input.plannedSessionCount, plannedFrequency: input.plannedFrequency, clinicalContext: { initialFunctionalStatus: input.initialFunctionalStatus, therapeuticGoals: input.therapeuticGoals, frameworkPlan: input.frameworkPlan }, precautions: input.precautions, diagnosisReferences: input.diagnoses.map((item) => ({ kind: item.kind, conditionId: conditionId(item.clientId) })) };
  const now = dependencies.clock?.now() ?? new Date();
  await dependencies.administration.putTreatment(treatment, input.diagnoses.map((item) => ({ id: conditionId(item.clientId), patientId: current.patientId, text: item.text, recordedAt: now.toISOString() })), current.version);
  return treatment;
}

export async function changeTreatmentStatus(treatmentId: string, expectedVersion: string | undefined, status: "paused" | "active" | "finished", note: string | undefined, endDate: string | undefined, dependencies: Dependencies) {
  const treatment = await dependencies.treatments.getById(treatmentId);
  if (!treatment) throw new AdministrationStateError("El tratamiento ya no está disponible.");
  if (treatment.version !== expectedVersion) throw new AdministrationStateError("El tratamiento cambió en otro dispositivo. Recargá la pantalla.");
  const now = dependencies.clock?.now() ?? new Date();
  const today = day(now);
  if (status === "finished") {
    if (!endDate || endDate < treatment.startDate || endDate > today) throw new AdministrationStateError("Revisá la fecha de cierre.");
  }
  if ((status === "paused" || status === "finished")) {
    const open = (await dependencies.scheduledVisits.listByPatientId(treatment.patientId)).filter((item) => item.treatmentId === treatment.id && ["booked", "proposed"].includes(item.status));
    if (open.length) throw new AdministrationStateError(`Primero resolvé ${open.length} ${open.length === 1 ? "visita abierta" : "visitas abiertas"}.`);
  }
  if (dependencies.visits && (status === "paused" || status === "finished") && (await dependencies.visits.listByPatientId(treatment.patientId)).some(v => v.treatmentId === treatment.id && v.status === "in-progress")) throw new AdministrationStateError("Primero finalizá o anulá la visita en curso.");
  if (status === "finished" && dependencies.periodFlow) {
    await dependencies.periods!.materialize(treatment);
    const latest = (await dependencies.treatments.getById(treatment.id))!;
    const period = await dependencies.periods!.current(latest);
    await changePeriod({ patientId: treatment.patientId, treatmentId, periodId: period.id, expectedVersion: period.version, event: "finish", endDate }, dependencies.periodFlow);
    return (await dependencies.treatments.getById(treatmentId))!;
  }
  const history = [...(treatment.statusHistory ?? [{ status: treatment.status, startedAt: treatment.startDate }])];
  const last = history.at(-1); if (last && !last.endedAt) last.endedAt = now.toISOString();
  history.push({ status, startedAt: now.toISOString(), note });
  const next: Treatment = { ...treatment, status, endDate: status === "finished" ? endDate : undefined, statusHistory: history };
  await dependencies.administration.putTreatment(next, [], treatment.version);
  return next;
}
