import { z } from "zod";
import type { Consultation, ConsultationContact, ConsultationEvidence, ConsultationRole } from "@/domain/consultation/consultation";
import type { Patient } from "@/domain/patient/patient";
import type { ConsultationRepository } from "./consultation.repository";
import { isActiveConsultationStatus } from "@/domain/consultation/consultation";
import { randomUUID } from "node:crypto";
import { acceptedQuote } from "@/domain/consultation/consultation";
import { createEvaluationAppointment, evaluationAppointmentInputSchema, type EvaluationAppointment } from "@/domain/consultation/consultation-appointment";
import { createInitialEvaluation, initialEvaluationInputSchema } from "@/domain/consultation/initial-evaluation";
import { treatmentInputSchema } from "@/application/administration/manage-patient-treatment";
import type { Treatment } from "@/domain/treatment/treatment";
import type { Diagnosis } from "@/domain/condition/condition";
import type { AgendaCoordinatorRepository, AgendaLease } from "@/application/schedule/agenda-coordinator.repository";
import type { ScheduledVisitRepository } from "@/application/schedule/scheduled-visit.repository";

const uuid = z.uuid();
const contactSchema = z.object({
  id: uuid,
  name: z.string().trim().min(1).max(160),
  relationship: z.string().trim().min(1).max(100),
  phone: z.string().trim().max(80).optional(),
  roles: z.array(z.enum(["requester", "coordination-contact", "budget-acceptor", "legal-representative", "authorized-recipient", "patient", "data-subject"])).min(1),
  representationBasis: z.string().trim().max(500).optional(),
});
const createSchema = z.object({
  clientId: uuid,
  patientId: z.string().regex(/^[A-Za-z0-9.-]{1,64}$/).optional(),
  initialReason: z.string().trim().max(2000).optional(),
  initialSource: z.enum(["patient", "family", "professional"]).optional(),
  patientGivenName: z.string().trim().max(160).optional(),
  patientFamilyName: z.string().trim().max(160).optional(),
  patientPhone: z.string().trim().max(80).optional(),
  patientAddress: z.string().trim().max(300).optional(),
  contact: contactSchema,
  contactIsPatient: z.coerce.boolean().default(false),
  dataNoticeRequesterGiven: z.coerce.boolean(),
  dataNoticePatientGiven: z.coerce.boolean().default(false),
  patientContactId: uuid.optional(),
  patientContactName: z.string().trim().max(160).optional(),
  patientContactRelationship: z.string().trim().max(100).optional(),
  dataNoticeAt: z.iso.datetime({ offset: true }),
  dataNoticeMethod: z.enum(["verbal", "written", "digital"]).default("digital"),
  nextFollowUpAt: z.iso.datetime({ offset: true }),
});

export class ConsultationInputError extends Error {}
export interface ConsultationDependencies {
  consultations: ConsultationRepository;
  patients: { getById(id: string): Promise<Patient | null> };
  clock?: { now(): Date };
  agendaCoordinator?: AgendaCoordinatorRepository;
  scheduledVisits?: Pick<ScheduledVisitRepository, "listOpen">;
}

function appointmentOverlaps(first: { startsAt?: string; endsAt?: string }, second: { startsAt?: string; endsAt?: string }) {
  return Boolean(first.startsAt && first.endsAt && second.startsAt && second.endsAt && new Date(first.startsAt) < new Date(second.endsAt) && new Date(second.startsAt) < new Date(first.endsAt));
}

async function saveEvaluationAppointmentMutation(
  input: { consultation: Consultation; appointments: EvaluationAppointment[]; expectedVersion: string },
  dependencies: Pick<ConsultationDependencies, "consultations" | "agendaCoordinator" | "scheduledVisits">,
  lease?: AgendaLease,
) {
  const creatingOrReplacing = input.appointments.find((item) => ["proposed", "confirmed"].includes(item.status));
  if (creatingOrReplacing && lease) {
    const [visits, evaluations] = await Promise.all([
      dependencies.scheduledVisits?.listOpen() ?? Promise.resolve([]),
      dependencies.consultations.listOpenEvaluationAppointments?.() ?? Promise.resolve([]),
    ]);
    const conflicts = visits.some((item) => appointmentOverlaps(item, creatingOrReplacing)) || evaluations.some((item) => item.id !== creatingOrReplacing.id && item.patientId === creatingOrReplacing.patientId && ["proposed", "confirmed"].includes(item.status) && appointmentOverlaps(item, creatingOrReplacing));
    if (conflicts) throw new ConsultationInputError("El horario se superpone con otra visita prevista.");
  }
  return dependencies.consultations.saveWithEvaluationAppointments({ ...input, ...(lease ? { agendaLease: lease } : {}) });
}

function withEvaluationAgenda<T>(dependencies: Pick<ConsultationDependencies, "agendaCoordinator">, operation: (lease?: AgendaLease) => Promise<T>) {
  return dependencies.agendaCoordinator ? dependencies.agendaCoordinator.withLock(operation) : operation();
}

export async function createConsultation(raw: unknown, dependencies: ConsultationDependencies): Promise<Consultation> {
  const input = createSchema.parse(raw);
  if (input.initialReason && !input.initialSource) throw new ConsultationInputError("Indicá quién refirió el motivo inicial.");
  const patientId = input.patientId ?? `patient-${input.clientId}`;
  let patient = await dependencies.patients.getById(patientId);
  if (input.patientId && !patient) throw new ConsultationInputError("La ficha del paciente no está disponible.");
  patient ??= {
    id: patientId,
    givenName: input.patientGivenName ?? "",
    familyName: input.patientFamilyName ?? "",
    phone: input.patientPhone || undefined,
    address: input.patientAddress || undefined,
  };
  if (!input.patientId) patient = { ...patient, givenName: input.patientGivenName ?? "", familyName: input.patientFamilyName ?? "", phone: input.patientPhone || undefined, address: input.patientAddress || undefined };

  const contact: ConsultationContact = {
    ...input.contact,
    phone: input.contact.phone || undefined,
    representationBasis: input.contact.representationBasis || undefined,
    roles: [...new Set([...input.contact.roles, ...(input.contactIsPatient ? ["patient" as const, "data-subject" as const] : [])])],
  };
  const patientContact: ConsultationContact | undefined = input.patientContactName?.trim() ? {
    id: input.patientContactId ?? randomUUID(), name: input.patientContactName.trim(), relationship: input.patientContactRelationship?.trim() || "Paciente",
    roles: ["patient", "data-subject"],
  } : undefined;
  const patientIsDistinct = !input.contactIsPatient && Boolean(patientContact);
  if (!input.dataNoticeRequesterGiven) throw new ConsultationInputError("Confirmá que informaste a la persona que inició la consulta antes de guardar sus datos.");
  if (patientIsDistinct && !input.dataNoticePatientGiven) throw new ConsultationInputError("Informá también al paciente antes de registrar sus datos personales.");
  if (contact.roles.includes("legal-representative") && !contact.representationBasis) {
    throw new ConsultationInputError("Indicá el fundamento de representación para registrar ese rol.");
  }
  const now = (dependencies.clock?.now() ?? new Date()).toISOString();
  const consultation: Consultation = {
    id: `consultation-${input.clientId}`,
    patientId,
    status: "open",
    initialContext: input.initialReason ? { reason: input.initialReason, source: input.initialSource! } : undefined,
    contacts: [contact, ...(patientContact ? [patientContact] : [])],
    noticesAndConsents: [
      { kind: "data-notice", subjectContactId: contact.id, actorContactId: contact.id, capacity: "self", at: input.dataNoticeAt, method: input.dataNoticeMethod, scope: "Datos personales para gestionar la consulta y la atención profesional." },
      ...(patientIsDistinct ? [{ kind: "data-notice" as const, subjectContactId: patientContact!.id, actorContactId: contact.id, capacity: "transmitted-to-patient", at: input.dataNoticeAt, method: input.dataNoticeMethod, scope: "Datos personales del paciente para gestionar la consulta y la atención profesional." }] : []),
    ],
    quotes: [],
    followUps: [{ id: `follow-up-${input.clientId}`, dueAt: input.nextFollowUpAt, status: "pending", history: [] }],
    appointmentIds: [],
    createdAt: now,
  };
  return dependencies.consultations.create({ consultation, patient });
}

export async function issueConsultationQuote(input: {
  consultationId: string; expectedVersion: string; scope: "initial-evaluation" | "treatment";
  amount: number; currency: string; modality: string; communicatedAt: string; nextFollowUpAt: string;
}, dependencies: Pick<ConsultationDependencies, "consultations">): Promise<Consultation> {
  z.object({ consultationId: z.string().min(1), expectedVersion: z.string().min(1), scope: z.enum(["initial-evaluation", "treatment"]), amount: z.number().finite().min(0), currency: z.string().trim().min(1).max(8), modality: z.string().trim().min(1).max(200), communicatedAt: z.iso.datetime({ offset: true }), nextFollowUpAt: z.iso.datetime({ offset: true }) }).parse(input);
  if (!Number.isFinite(input.amount) || input.amount < 0) throw new ConsultationInputError("El importe debe ser cero o mayor.");
  const current = await dependencies.consultations.getById(input.consultationId);
  if (!current || current.version !== input.expectedVersion || !isActiveConsultationStatus(current.status)) throw new ConsultationInputError("La consulta cambió o ya no admite presupuestos.");
  if (input.scope === "initial-evaluation") {
    const openAppointments = await Promise.all(current.appointmentIds.map((id) => dependencies.consultations.getEvaluationAppointment(id)));
    if (openAppointments.some((item) => item && ["proposed", "confirmed"].includes(item.status))) throw new ConsultationInputError("Resolvé la cita de evaluación abierta antes de revisar ese presupuesto.");
  }
  const previous = current.quotes.filter((quote) => quote.scope === input.scope && !quote.supersededAt).sort((a, b) => b.revision - a.revision)[0];
  if (previous?.status === "pending") throw new ConsultationInputError("Registrá la respuesta al presupuesto vigente antes de revisarlo.");
  const quotes = previous ? current.quotes.map((quote) => quote.id === previous.id ? { ...quote, supersededAt: input.communicatedAt } : quote) : current.quotes;
  const quote = { id: randomUUID(), scope: input.scope, revision: (previous?.revision ?? 0) + 1, amount: input.amount, currency: input.currency.trim(), modality: input.modality.trim(), communicatedAt: input.communicatedAt, status: "pending" as const };
  const followUps = current.followUps.map((item) => item.status === "pending" ? { ...item, status: "completed" as const, resultOrReason: "Se comunicó una nueva versión", history: [...item.history, { at: input.communicatedAt, event: "completed" as const, detail: "Se comunicó una nueva versión" }] } : item);
  followUps.push({ id: randomUUID(), dueAt: input.nextFollowUpAt, status: "pending", history: [] });
  return dependencies.consultations.save({ ...current, quotes: [...quotes, quote], followUps }, input.expectedVersion);
}

function hasAcceptedEvaluationBudget(consultation: Consultation) {
  return acceptedQuote(consultation, "initial-evaluation") !== null;
}

function ensureFutureEvaluationAppointment(appointment: EvaluationAppointment, now: Date) {
  if (new Date(`${appointment.scheduledDate}T00:00:00-03:00`) < new Date(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires", year: "numeric", month: "2-digit", day: "2-digit" }).format(now) + "T00:00:00-03:00") || (appointment.startsAt && new Date(appointment.startsAt) <= now)) {
    throw new ConsultationInputError("La cita de evaluación no puede quedar en el pasado.");
  }
}

export async function scheduleConsultationEvaluation(input: {
  consultationId: string; expectedVersion: string; clientAppointmentId: string; scheduledDate: string;
  startsAt?: string; durationMinutes?: number; at?: string;
}, dependencies: Pick<ConsultationDependencies, "consultations" | "clock" | "agendaCoordinator" | "scheduledVisits">) {
  const parsed = evaluationAppointmentInputSchema.parse({ clientAppointmentId: input.clientAppointmentId, scheduledDate: input.scheduledDate, startsAt: input.startsAt, durationMinutes: input.durationMinutes });
  const current = await dependencies.consultations.getById(input.consultationId);
  const operationAppointmentId = `evaluation-appointment-${parsed.clientAppointmentId}`;
  if (current?.appointmentIds.includes(operationAppointmentId)) {
    const existing = await dependencies.consultations.getEvaluationAppointment(operationAppointmentId);
    if (existing && existing.consultationId === current.id && existing.patientId === current.patientId && existing.scheduledDate === parsed.scheduledDate && existing.startsAt === parsed.startsAt && existing.durationMinutes === (parsed.startsAt ? parsed.durationMinutes : undefined)) return { consultation: current, appointment: existing };
    throw new ConsultationInputError("La misma operación se reintentó con datos diferentes.");
  }
  if (!current || current.version !== input.expectedVersion || current.status !== "coordinating" || !hasAcceptedEvaluationBudget(current)) throw new ConsultationInputError("Para coordinar la evaluación, la consulta debe estar en coordinación y tener aceptado el presupuesto vigente de evaluación.");
  const existing = await Promise.all(current.appointmentIds.map((id) => dependencies.consultations.getEvaluationAppointment(id)));
  if (existing.some((item) => item && ["proposed", "confirmed"].includes(item.status))) throw new ConsultationInputError("Ya hay una cita de evaluación pendiente. Reprogramala desde su historial.");
  const now = (dependencies.clock?.now() ?? new Date());
  const appointment = createEvaluationAppointment({ ...parsed, consultationId: current.id, patientId: current.patientId, createdAt: (input.at ? new Date(input.at) : now).toISOString() });
  ensureFutureEvaluationAppointment(appointment, now);
  const followUps = current.followUps.map((item) => item.status === "pending" ? { ...item, status: "completed" as const, resultOrReason: "Se coordinó la visita de evaluación", history: [...item.history, { at: appointment.createdAt, event: "completed" as const, detail: "Se coordinó la visita de evaluación" }] } : item);
  const saved = await withEvaluationAgenda(dependencies, (lease) => saveEvaluationAppointmentMutation({
    consultation: { ...current, appointmentIds: [...current.appointmentIds, appointment.id], followUps }, appointments: [appointment], expectedVersion: input.expectedVersion,
  }, dependencies, lease));
  return { consultation: saved, appointment };
}

export async function rescheduleConsultationEvaluation(input: {
  consultationId: string; expectedVersion: string; appointmentId: string; expectedAppointmentVersion: string;
  clientAppointmentId: string; scheduledDate: string; startsAt?: string; durationMinutes?: number;
  reason: NonNullable<EvaluationAppointment["reason"]>; note?: string; at?: string;
}, dependencies: Pick<ConsultationDependencies, "consultations" | "clock" | "agendaCoordinator" | "scheduledVisits">) {
  const parsed = evaluationAppointmentInputSchema.parse({ clientAppointmentId: input.clientAppointmentId, scheduledDate: input.scheduledDate, startsAt: input.startsAt, durationMinutes: input.durationMinutes });
  const current = await dependencies.consultations.getById(input.consultationId);
  const old = await dependencies.consultations.getEvaluationAppointment(input.appointmentId);
  const operationAppointmentId = `evaluation-appointment-${parsed.clientAppointmentId}`;
  if (current?.appointmentIds.includes(operationAppointmentId) && old?.replacedById === operationAppointmentId) {
    const replacement = await dependencies.consultations.getEvaluationAppointment(operationAppointmentId);
    if (replacement && replacement.consultationId === current.id && replacement.patientId === current.patientId && replacement.scheduledDate === parsed.scheduledDate && replacement.startsAt === parsed.startsAt && replacement.durationMinutes === (parsed.startsAt ? parsed.durationMinutes : undefined)) return { consultation: current, appointment: replacement, previousAppointment: old };
    throw new ConsultationInputError("La misma operación se reintentó con datos diferentes.");
  }
  if (!current || current.version !== input.expectedVersion || !old || old.consultationId !== current.id || old.version !== input.expectedAppointmentVersion || !["proposed", "confirmed"].includes(old.status) || current.status !== "coordinating") throw new ConsultationInputError("La consulta o la cita cambió. Recargá antes de reprogramar.");
  if (!hasAcceptedEvaluationBudget(current)) throw new ConsultationInputError("La evaluación ya no tiene un presupuesto aceptado vigente.");
  const now = dependencies.clock?.now() ?? new Date();
  if (input.reason === "other" && !input.note?.trim()) throw new ConsultationInputError("Explicá el motivo para registrar ‘Otro’.");
  const created = createEvaluationAppointment({ ...parsed, consultationId: current.id, patientId: current.patientId, createdAt: (input.at ? new Date(input.at) : now).toISOString() });
  ensureFutureEvaluationAppointment(created, now);
  const replacement: EvaluationAppointment = { ...created, replacesId: old.id };
  const replaced: EvaluationAppointment = { ...old, status: "cancelled", replacedById: replacement.id, reason: input.reason, note: input.note?.trim() || undefined };
  const followUps = current.followUps.map((item) => item.status === "pending" ? { ...item, status: "completed" as const, resultOrReason: "Se reprogramó la visita de evaluación", history: [...item.history, { at: replacement.createdAt, event: "completed" as const, detail: "Se reprogramó la visita de evaluación" }] } : item);
  const saved = await withEvaluationAgenda(dependencies, (lease) => saveEvaluationAppointmentMutation({
    consultation: { ...current, appointmentIds: [...current.appointmentIds, replacement.id], followUps }, appointments: [replaced, replacement], expectedVersion: input.expectedVersion,
  }, dependencies, lease));
  return { consultation: saved, appointment: replacement, previousAppointment: replaced };
}

export async function closeConsultationEvaluationAppointment(input: {
  consultationId: string; expectedVersion: string; appointmentId: string; expectedAppointmentVersion: string;
  status: "cancelled" | "not-performed"; reason: NonNullable<EvaluationAppointment["reason"]>; note?: string; at?: string; nextFollowUpAt: string;
}, dependencies: Pick<ConsultationDependencies, "consultations">) {
  z.object({ nextFollowUpAt: z.iso.datetime({ offset: true }) }).parse({ nextFollowUpAt: input.nextFollowUpAt });
  const current = await dependencies.consultations.getById(input.consultationId);
  const appointment = await dependencies.consultations.getEvaluationAppointment(input.appointmentId);
  if (!current || current.version !== input.expectedVersion || !appointment || appointment.consultationId !== current.id || appointment.version !== input.expectedAppointmentVersion || !["proposed", "confirmed"].includes(appointment.status)) throw new ConsultationInputError("La consulta o la cita cambió. Recargá antes de continuar.");
  if (input.reason === "other" && !input.note?.trim()) throw new ConsultationInputError("Explicá el motivo para registrar ‘Otro’.");
  if (input.status === "not-performed" && new Date(input.at ?? Date.now()) < new Date(appointment.endsAt ?? `${appointment.scheduledDate}T23:59:59-03:00`)) throw new ConsultationInputError("Todavía no corresponde marcar esta visita como no realizada.");
  const changed: EvaluationAppointment = { ...appointment, status: input.status, reason: input.reason, note: input.note?.trim() || undefined };
  const at = input.at ?? new Date().toISOString();
  const followUps = current.followUps.map((item) => item.status === "pending" ? { ...item, status: "cancelled" as const, resultOrReason: `Cita ${input.status === "cancelled" ? "cancelada" : "no realizada"}`, history: [...item.history, { at, event: "cancelled" as const, detail: `Cita ${input.status === "cancelled" ? "cancelada" : "no realizada"}` }] } : item);
  followUps.push({ id: randomUUID(), dueAt: input.nextFollowUpAt, status: "pending", history: [] });
  const saved = await dependencies.consultations.saveWithEvaluationAppointments({ consultation: { ...current, followUps }, appointments: [changed], expectedVersion: input.expectedVersion });
  return { consultation: saved, appointment: changed };
}

export async function recordInitialEvaluation(raw: unknown, dependencies: Pick<ConsultationDependencies, "consultations" | "clock">) {
  const command = z.object({ expectedVersion: z.string().min(1), expectedAppointmentVersion: z.string().min(1).optional(), consentConfirmed: z.literal(true) }).parse(raw);
  const input = initialEvaluationInputSchema.parse(raw);
  const current = await dependencies.consultations.getById(input.consultationId);
  const evaluationId = `initial-evaluation-${input.operationId}`;
  if (current?.initialEvaluationId === evaluationId) {
    const existing = await dependencies.consultations.getInitialEvaluation(evaluationId);
    const consent = current.noticesAndConsents.find((item) => item.kind === "clinical-consent" && item.scope === `Evaluación inicial ${input.appointmentId ?? evaluationId}`);
    if (existing && existing.patientId === current.patientId && existing.appointmentId === input.appointmentId && existing.startedAt === input.startedAt && existing.endedAt === input.endedAt && existing.reason === input.reason && existing.subjective === input.subjective && existing.objective === input.objective && existing.assessment === input.assessment && existing.goalsAndPlan === input.goalsAndPlan && JSON.stringify(existing.clinicalEntries) === JSON.stringify(input.clinicalEntries) && consent?.actorContactId === input.consentContactId && consent.method === input.consentMethod && consent.at === input.consentAt) return { consultation: current, evaluation: existing };
    throw new ConsultationInputError("La misma operación de evaluación se reintentó con contenido diferente.");
  }
  if (await dependencies.consultations.getInitialEvaluation(evaluationId)) throw new ConsultationInputError("La identidad de esta operación ya corresponde a otra evaluación.");
  if (!current || current.version !== command.expectedVersion || !["open", "coordinating"].includes(current.status) || current.initialEvaluationId) throw new ConsultationInputError("La consulta cambió o no está habilitada para registrar la evaluación.");
  const openAppointments = (await Promise.all(current.appointmentIds.map(id => dependencies.consultations.getEvaluationAppointment(id)))).filter(item => item && ["proposed", "confirmed"].includes(item.status));
  const appointment = input.appointmentId ? await dependencies.consultations.getEvaluationAppointment(input.appointmentId) : null;
  if (openAppointments.some(item => item!.id !== input.appointmentId)) throw new ConsultationInputError("Vinculá o resolvé primero la cita de evaluación abierta.");
  if (input.appointmentId && (!appointment || appointment.consultationId !== current.id || appointment.patientId !== current.patientId || !["proposed", "confirmed"].includes(appointment.status) || appointment.version !== command.expectedAppointmentVersion)) throw new ConsultationInputError("La cita cambió o ya no está abierta.");
  if (appointment && appointment.scheduledDate !== new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(input.startedAt))) throw new ConsultationInputError("La fecha registrada debe coincidir con la cita vinculada.");
  const now = dependencies.clock?.now() ?? new Date();
  if (new Date(input.endedAt) > now) throw new ConsultationInputError("La evaluación solo se puede guardar después de realizarla.");
  if (new Date(input.consentAt) > new Date(input.startedAt) || new Date(input.consentAt) > now) throw new ConsultationInputError("El consentimiento clínico debe constar antes o al inicio de la evaluación.");
  const subject = current.contacts.find((contact) => contact.roles.includes("patient") && contact.roles.includes("data-subject"));
  if (!subject) throw new ConsultationInputError("No hay una persona paciente identificada para registrar el consentimiento clínico.");
  const actor = current.contacts.find((contact) => contact.id === input.consentContactId);
  if (!actor) throw new ConsultationInputError("Elegí quién otorgó el consentimiento clínico.");
  const capacity = actor.id === subject.id && actor.roles.includes("patient") ? "self" : "legal-representative";
  if (capacity === "legal-representative" && (!actor.roles.includes("legal-representative") || !actor.representationBasis)) throw new ConsultationInputError("El consentimiento debe otorgarlo el paciente o una persona con representación registrada y fundamento.");
  const evidence = recordConsultationEvidence(current, {
    kind: "clinical-consent", subjectContactId: subject.id, actorContactId: actor.id, capacity,
    at: input.consentAt, method: input.consentMethod, scope: `Evaluación inicial ${appointment?.id ?? evaluationId}`,
    ...(actor.representationBasis ? { representationBasis: actor.representationBasis } : {}),
  });
  const evaluation = createInitialEvaluation(input, current.patientId, now.toISOString());
  const realized = appointment ? { ...appointment, status: "realized" as const } : undefined;
  const consultation = { ...evidence, initialEvaluationId: evaluation.id, status: "evaluation-completed" as const };
  const saved = await dependencies.consultations.completeInitialEvaluation({ consultation, appointment: realized, evaluation, expectedVersion: command.expectedVersion });
  return { consultation: saved, evaluation };
}

export async function startTreatmentFromConsultation(raw: unknown, dependencies: ConsultationDependencies & {
  treatments: { getById(id: string): Promise<Treatment | null>; listDirectory(): Promise<Treatment[]>; listByPatientId?(patientId: string): Promise<Treatment[]> };
}) {
  const command = z.object({ expectedVersion: z.string().min(1), consentContactId: z.string().min(1), consentMethod: z.enum(["verbal", "written", "digital"]), consentAt: z.iso.datetime({ offset: true }), consentConfirmed: z.literal(true) }).parse(raw);
  const input = treatmentInputSchema.parse(raw);
  const current = await dependencies.consultations.getById(String((raw as Record<string, unknown>).consultationId ?? ""));
  const operationTreatmentId = `treatment-${input.clientId}`;
  if (current?.status === "treatment-started" && current.treatmentId === operationTreatmentId) {
    const existing = await dependencies.treatments.getById(operationTreatmentId);
    const expectedDiagnoses = input.diagnoses.map((item) => ({ kind: item.kind, conditionId: `condition-${item.clientId}` }));
    const consent = current.noticesAndConsents.find((item) => item.kind === "clinical-consent" && item.scope === `Tratamiento ${operationTreatmentId}`);
    const sameContext = existing?.clinicalContext?.initialFunctionalStatus === input.initialFunctionalStatus && existing?.clinicalContext?.therapeuticGoals === input.therapeuticGoals && existing?.clinicalContext?.frameworkPlan === input.frameworkPlan;
    const samePrecautions = JSON.stringify(existing?.precautions ?? []) === JSON.stringify(input.precautions);
    const sameDiagnoses = JSON.stringify(existing?.diagnosisReferences ?? []) === JSON.stringify(expectedDiagnoses);
    if (existing && existing.patientId === current.patientId && existing.startDate === input.startDate && existing.plannedSessionCount === input.plannedSessionCount && existing.plannedFrequency === input.plannedFrequency && sameContext && samePrecautions && sameDiagnoses && consent?.actorContactId === command.consentContactId && consent.method === command.consentMethod && consent.at === command.consentAt) return { consultation: current, treatment: existing };
    throw new ConsultationInputError("La misma operación de inicio se reintentó con otros datos.");
  }
  if (!current || current.version !== command.expectedVersion || current.status !== "evaluation-completed" || current.patientId !== input.patientId || !current.initialEvaluationId) throw new ConsultationInputError("La consulta debe tener una evaluación registrada y vigente antes de iniciar tratamiento.");
  const patient = await dependencies.patients.getById(current.patientId);
  if (!patient?.version || patient.activeConsultationId !== current.id) throw new ConsultationInputError("No se pudo verificar la consulta activa en la ficha del paciente.");
  const evaluation = await dependencies.consultations.getInitialEvaluation(current.initialEvaluationId);
  if (!evaluation || evaluation.consultationId !== current.id || evaluation.patientId !== patient.id) throw new ConsultationInputError("No se pudo verificar la evaluación inicial registrada.");
  const acceptedTreatmentQuote = acceptedQuote(current, "treatment");
  if (!acceptedTreatmentQuote) throw new ConsultationInputError("Aceptá primero una versión vigente del presupuesto de tratamiento.");
  const now = dependencies.clock?.now() ?? new Date();
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  if (input.startDate > today) throw new ConsultationInputError("La fecha de inicio no puede ser futura.");
  if (new Date(command.consentAt) > now) throw new ConsultationInputError("El consentimiento clínico debe haberse otorgado antes de iniciar el tratamiento.");
  const subject = current.contacts.find((contact) => contact.roles.includes("patient") && contact.roles.includes("data-subject"));
  const actor = current.contacts.find((contact) => contact.id === command.consentContactId);
  if (!subject || !actor) throw new ConsultationInputError("Elegí al paciente o a una persona representante registrada para documentar el consentimiento clínico.");
  const capacity = actor.id === subject.id && actor.roles.includes("patient") ? "self" : "legal-representative";
  if (capacity === "legal-representative" && (!actor.roles.includes("legal-representative") || !actor.representationBasis)) throw new ConsultationInputError("El consentimiento debe otorgarlo el paciente o una persona con representación registrada y fundamento.");
  const existing = await dependencies.treatments.getById(operationTreatmentId);
  if (existing) throw new ConsultationInputError("La identidad de esta operación ya corresponde a otro tratamiento.");
  const existingTreatments = dependencies.treatments.listByPatientId ? await dependencies.treatments.listByPatientId(patient.id) : (await dependencies.treatments.listDirectory()).filter((item) => item.patientId === patient.id);
  if (existingTreatments.some((item) => item.status === "active")) throw new ConsultationInputError("El paciente ya tiene un tratamiento activo.");
  const diagnoses: Diagnosis[] = input.diagnoses.map((item) => ({ id: `condition-${item.clientId}`, patientId: patient.id, text: item.text, recordedAt: now.toISOString() }));
  const treatment: Treatment = {
    id: operationTreatmentId, patientId: patient.id, status: "active", startDate: input.startDate,
    sourceConsultationId: current.id, initialEvaluationId: current.initialEvaluationId, acceptedTreatmentQuoteId: acceptedTreatmentQuote.id,
    plannedSessionCount: input.plannedSessionCount, plannedFrequency: input.plannedFrequency,
    clinicalContext: { initialFunctionalStatus: input.initialFunctionalStatus, therapeuticGoals: input.therapeuticGoals, frameworkPlan: input.frameworkPlan },
    precautions: input.precautions,
    diagnosisReferences: input.diagnoses.map((item) => ({ kind: item.kind, conditionId: `condition-${item.clientId}` })),
    statusHistory: [{ status: "active", startedAt: now.toISOString() }],
  };
  const evidence = recordConsultationEvidence(current, {
    kind: "clinical-consent", subjectContactId: subject.id, actorContactId: actor.id,
    capacity, at: command.consentAt, method: command.consentMethod, scope: `Tratamiento ${treatment.id}`,
    ...(actor.representationBasis ? { representationBasis: actor.representationBasis } : {}),
  });
  const consultation: Consultation = { ...evidence, status: "treatment-started", treatmentId: treatment.id };
  const saved = await dependencies.consultations.startTreatmentFromConsultation({ consultation, treatment, diagnoses, expectedPatientVersion: patient.version, expectedVersion: command.expectedVersion });
  return { consultation: saved, treatment };
}

export async function respondToConsultationQuote(input: {
  consultationId: string; expectedVersion: string; quoteId: string; response: "accepted" | "rejected";
  contactId: string; at: string; nextFollowUpAt: string;
}, dependencies: Pick<ConsultationDependencies, "consultations">): Promise<Consultation> {
  z.object({ consultationId: z.string().min(1), expectedVersion: z.string().min(1), quoteId: z.string().min(1), response: z.enum(["accepted", "rejected"]), contactId: z.string().min(1), at: z.iso.datetime({ offset: true }), nextFollowUpAt: z.iso.datetime({ offset: true }) }).parse(input);
  const current = await dependencies.consultations.getById(input.consultationId);
  if (!current || current.version !== input.expectedVersion || !isActiveConsultationStatus(current.status)) throw new ConsultationInputError("La consulta cambió o ya no admite respuestas.");
  const quote = current.quotes.find((item) => item.id === input.quoteId);
  if (!quote || quote.supersededAt || quote.status !== "pending") throw new ConsultationInputError("Ese presupuesto ya no está vigente para responder.");
  const contact = current.contacts.find((item) => item.id === input.contactId);
  if (!contact?.roles.includes("budget-acceptor")) throw new ConsultationInputError("Esta persona no está registrada como aceptante del presupuesto.");
  const quotes = current.quotes.map((item) => item.id === quote.id ? { ...item, status: input.response, responseAt: input.at, acceptedByContactId: input.response === "accepted" ? contact.id : undefined } : item);
  const status = input.response === "accepted" && quote.scope === "initial-evaluation" && current.status === "open" ? "coordinating" : current.status;
  const noticesAndConsents = input.response === "accepted" ? [...current.noticesAndConsents, {
    kind: "budget-acceptance" as const, subjectContactId: contact.id, actorContactId: contact.id,
    capacity: contact.roles.includes("legal-representative") ? "legal-representative" : "budget-acceptor",
    at: input.at, method: "digital" as const, scope: `${quote.scope}:${quote.id}`,
    ...(contact.representationBasis ? { representationBasis: contact.representationBasis } : {}),
  }] : current.noticesAndConsents;
  const followUps = current.followUps.map((item) => item.status === "pending" ? { ...item, status: "completed" as const, resultOrReason: input.response === "accepted" ? "Presupuesto aceptado" : "Presupuesto rechazado", history: [...item.history, { at: input.at, event: "completed" as const, detail: `Presupuesto ${input.response === "accepted" ? "aceptado" : "rechazado"}` }] } : item);
  followUps.push({ id: randomUUID(), dueAt: input.nextFollowUpAt, status: "pending", history: [] });
  return dependencies.consultations.save({ ...current, status, quotes, noticesAndConsents, followUps }, input.expectedVersion);
}

export async function closeConsultation(input: {
  consultationId: string; expectedVersion: string; reason: NonNullable<Consultation["closeReason"]>;
  note?: string; openAppointmentIds: string[]; hasVisitInProgress: boolean; at: string;
}, dependencies: Pick<ConsultationDependencies, "consultations">): Promise<Consultation> {
  z.object({ consultationId: z.string().min(1), expectedVersion: z.string().min(1), reason: z.enum(["no-response", "quote-declined", "withdrew", "referred", "other"]), note: z.string().trim().max(1000).optional(), openAppointmentIds: z.array(z.string()), hasVisitInProgress: z.boolean(), at: z.iso.datetime({ offset: true }) }).parse(input);
  const current = await dependencies.consultations.getById(input.consultationId);
  if (!current || current.version !== input.expectedVersion || !isActiveConsultationStatus(current.status)) throw new ConsultationInputError("La consulta cambió o ya está cerrada.");
  if (input.openAppointmentIds.length || input.hasVisitInProgress) throw new ConsultationInputError("Primero resolvé las citas abiertas y la visita en curso.");
  if (input.reason === "other" && !input.note?.trim()) throw new ConsultationInputError("Explicá el motivo de cierre.");
  const followUps = current.followUps.map((item) => item.status === "pending" ? { ...item, status: "cancelled" as const, resultOrReason: input.note ?? input.reason, history: [...item.history, { at: input.at, event: "cancelled" as const, detail: input.note ?? input.reason }] } : item);
  return dependencies.consultations.save({ ...current, status: "closed", closeReason: input.reason, closeNote: input.note, followUps }, input.expectedVersion);
}

export async function updateConsultationFollowUp(input: {
  consultationId: string; expectedVersion: string; followUpId: string;
  action: "reschedule" | "complete" | "cancel"; at: string; nextFollowUpAt?: string; resultOrReason?: string;
}, dependencies: Pick<ConsultationDependencies, "consultations">): Promise<Consultation> {
  z.object({
    consultationId: z.string().min(1), expectedVersion: z.string().min(1), followUpId: z.string().min(1),
    action: z.enum(["reschedule", "complete", "cancel"]), at: z.iso.datetime({ offset: true }),
    nextFollowUpAt: z.iso.datetime({ offset: true }).optional(), resultOrReason: z.string().trim().max(1000).optional(),
  }).parse(input);
  const current = await dependencies.consultations.getById(input.consultationId);
  if (!current || current.version !== input.expectedVersion || !isActiveConsultationStatus(current.status)) throw new ConsultationInputError("La consulta cambió o ya no admite cambios de seguimiento.");
  const followUp = current.followUps.find((item) => item.id === input.followUpId);
  if (!followUp || followUp.status !== "pending") throw new ConsultationInputError("Ese seguimiento ya fue resuelto o reemplazado.");
  if (input.action === "reschedule") {
    if (!input.nextFollowUpAt) throw new ConsultationInputError("Indicá la nueva fecha del próximo contacto.");
    const oldAt = followUp.dueAt;
    const followUps = current.followUps.map((item) => item.id === followUp.id ? {
      ...item, dueAt: input.nextFollowUpAt!,
      history: [...item.history, { at: input.at, event: "rescheduled" as const, detail: `Reprogramado desde ${oldAt} hasta ${input.nextFollowUpAt}` }],
    } : item);
    return dependencies.consultations.save({ ...current, followUps }, input.expectedVersion);
  }
  if (!input.resultOrReason?.trim()) throw new ConsultationInputError(input.action === "complete" ? "Registrá el resultado del contacto." : "Indicá el motivo para cancelar el seguimiento.");
  const followUps = current.followUps.map((item) => item.id === followUp.id ? {
    ...item, status: input.action === "complete" ? "completed" as const : "cancelled" as const,
    resultOrReason: input.resultOrReason!.trim(),
    history: [...item.history, { at: input.at, event: input.action === "complete" ? "completed" as const : "cancelled" as const, detail: input.resultOrReason!.trim() }],
  } : item);
  return dependencies.consultations.save({ ...current, followUps }, input.expectedVersion);
}

export async function authorizeThirdPartyDisclosure(input: {
  consultationId: string; expectedVersion: string; recipientContactId: string; recipientName: string;
  relationship: string; phone?: string; actorContactId: string; method: "verbal" | "written" | "digital";
  at: string; scope: string;
}, dependencies: Pick<ConsultationDependencies, "consultations">) {
  const parsed = z.object({
    consultationId: z.string().min(1), expectedVersion: z.string().min(1), recipientContactId: uuid,
    recipientName: z.string().trim().min(1).max(160), relationship: z.string().trim().min(1).max(100),
    phone: z.string().trim().max(80).optional(), actorContactId: uuid,
    method: z.enum(["verbal", "written", "digital"]), at: z.iso.datetime({ offset: true }),
    scope: z.string().trim().min(1).max(500),
  }).parse(input);
  const current = await dependencies.consultations.getById(parsed.consultationId);
  if (!current || current.version !== parsed.expectedVersion || !isActiveConsultationStatus(current.status)) throw new ConsultationInputError("La consulta cambió o ya no admite nuevas autorizaciones.");
  const subject = current.contacts.find((contact) => contact.roles.includes("patient") && contact.roles.includes("data-subject"));
  const actor = current.contacts.find((contact) => contact.id === parsed.actorContactId);
  if (!subject || !actor) throw new ConsultationInputError("No se pudo identificar al paciente y a quien otorga la autorización.");
  const self = actor.id === subject.id;
  if (!self && (!actor.roles.includes("legal-representative") || !actor.representationBasis)) throw new ConsultationInputError("La autorización debe otorgarla el paciente o un representante con fundamento registrado.");
  if (parsed.recipientContactId === subject.id || parsed.recipientContactId === actor.id) throw new ConsultationInputError("El destinatario debe ser otra persona vinculada.");
  const existing = current.contacts.find((contact) => contact.id === parsed.recipientContactId);
  if (existing && (existing.name !== parsed.recipientName || existing.relationship !== parsed.relationship)) throw new ConsultationInputError("El identificador del destinatario ya está asociado a otra persona.");
  const recipient: ConsultationContact = {
    ...(existing ?? { id: parsed.recipientContactId, name: parsed.recipientName, relationship: parsed.relationship, roles: ["authorized-recipient"] as ConsultationRole[] }),
    roles: [...new Set([...(existing?.roles ?? []), "authorized-recipient" as const])],
    phone: parsed.phone || existing?.phone,
  };
  const withRecipient = existing
    ? { ...current, contacts: current.contacts.map((contact) => contact.id === recipient.id ? recipient : contact) }
    : { ...current, contacts: [...current.contacts, recipient] };
  const updated = recordConsultationEvidence(withRecipient, {
    kind: "third-party-disclosure", id: randomUUID(), subjectContactId: subject.id, actorContactId: actor.id, recipientContactId: recipient.id,
    capacity: self ? "self" : "legal-representative", at: parsed.at, method: parsed.method,
    scope: parsed.scope, ...(actor.representationBasis ? { representationBasis: actor.representationBasis } : {}),
  });
  return dependencies.consultations.save(updated, parsed.expectedVersion);
}

export async function revokeThirdPartyDisclosure(input: {
  consultationId: string; expectedVersion: string; authorizationId: string; actorContactId: string;
  method: "verbal" | "written" | "digital"; at: string; reason: string;
}, dependencies: Pick<ConsultationDependencies, "consultations">) {
  const parsed = z.object({
    consultationId: z.string().min(1), expectedVersion: z.string().min(1), authorizationId: uuid,
    actorContactId: uuid, method: z.enum(["verbal", "written", "digital"]), at: z.iso.datetime({ offset: true }),
    reason: z.string().trim().min(1).max(500),
  }).parse(input);
  const current = await dependencies.consultations.getById(parsed.consultationId);
  if (!current || current.version !== parsed.expectedVersion || !isActiveConsultationStatus(current.status)) throw new ConsultationInputError("La consulta cambió o ya no admite cambios de autorización.");
  const authorization = current.noticesAndConsents.find((item) => item.id === parsed.authorizationId && item.kind === "third-party-disclosure");
  if (!authorization?.recipientContactId) throw new ConsultationInputError("No se encontró la autorización vigente seleccionada.");
  if (current.noticesAndConsents.some((item) => item.kind === "third-party-disclosure-revocation" && item.relatedEvidenceId === authorization.id)) throw new ConsultationInputError("Esta autorización ya fue revocada.");
  const subject = current.contacts.find((contact) => contact.id === authorization.subjectContactId && contact.roles.includes("patient"));
  const actor = current.contacts.find((contact) => contact.id === parsed.actorContactId);
  if (!subject || !actor) throw new ConsultationInputError("No se pudo verificar al paciente y a quien revoca la autorización.");
  const self = actor.id === subject.id;
  if (!self && (!actor.roles.includes("legal-representative") || !actor.representationBasis)) throw new ConsultationInputError("La revocación debe registrarla el paciente o un representante con fundamento registrado.");
  const evidence = recordConsultationEvidence(current, {
    kind: "third-party-disclosure-revocation", id: randomUUID(), relatedEvidenceId: authorization.id,
    subjectContactId: subject.id, actorContactId: actor.id, recipientContactId: authorization.recipientContactId,
    capacity: self ? "self" : "legal-representative", at: parsed.at, method: parsed.method,
    scope: `Revoca autorización: ${parsed.reason}`, ...(actor.representationBasis ? { representationBasis: actor.representationBasis } : {}),
  });
  return dependencies.consultations.save(evidence, parsed.expectedVersion);
}

export function recordConsultationEvidence(
  consultation: Consultation,
  evidence: ConsultationEvidence,
): Consultation {
  const subject = consultation.contacts.find((contact) => contact.id === evidence.subjectContactId);
  const actor = consultation.contacts.find((contact) => contact.id === evidence.actorContactId);
  if (!subject || !actor) throw new ConsultationInputError("La persona vinculada al registro no está en esta consulta.");
  if (evidence.kind === "budget-acceptance" && !actor.roles.includes("budget-acceptor")) {
    throw new ConsultationInputError("Esta persona no está registrada como aceptante del presupuesto.");
  }
  if (evidence.capacity === "legal-representative" && (!actor.roles.includes("legal-representative") || !actor.representationBasis)) {
    throw new ConsultationInputError("No consta el fundamento de representación de esta persona.");
  }
  if (evidence.kind === "third-party-disclosure" || evidence.kind === "third-party-disclosure-revocation") {
    const recipient = consultation.contacts.find((contact) => contact.id === evidence.recipientContactId);
    if (!recipient || !recipient.roles.includes("authorized-recipient") || evidence.subjectContactId !== subject.id || (evidence.capacity === "self" && actor.id !== subject.id)) {
      throw new ConsultationInputError("La autorización debe vincular al paciente, a quien la otorga y a un destinatario identificado.");
    }
  }
  return { ...consultation, noticesAndConsents: [...consultation.noticesAndConsents, evidence] };
}
