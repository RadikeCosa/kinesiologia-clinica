import type { PatientRepository } from "@/application/patients/patient.repository";
import type { ScheduledVisitRepository } from "@/application/schedule/scheduled-visit.repository";
import type { TreatmentRepository } from "@/application/treatments/treatment.repository";
import {
  appointmentsOverlap,
  closeScheduledVisitSchema,
  createScheduledVisitFromInput,
  createScheduledVisitSchema,
  rescheduleVisitSchema,
  type ScheduledVisit,
} from "@/domain/schedule/scheduled-visit";

export interface Clock { now(): Date }
export const systemClock: Clock = { now: () => new Date() };

export class ScheduleOverlapError extends Error {
  constructor(readonly conflicts: ScheduledVisit[]) {
    super("El horario se superpone con otra visita prevista.");
  }
}

export class ScheduleStateError extends Error {}

type Dependencies = {
  patients: PatientRepository;
  treatments: TreatmentRepository;
  scheduledVisits: ScheduledVisitRepository;
  clock?: Clock;
};

function localDate(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).format(date);
}

async function requireActiveContext(patientId: string, treatmentId: string, dependencies: Dependencies) {
  const [patient, treatment] = await Promise.all([
    dependencies.patients.getById(patientId),
    dependencies.treatments.getById(treatmentId),
  ]);
  if (!patient || !treatment || treatment.patientId !== patient.id || treatment.status !== "active") {
    throw new ScheduleStateError("El paciente o tratamiento activo no está disponible.");
  }
}

function ensureNotPast(visit: ScheduledVisit, now: Date) {
  const today = localDate(now);
  if (visit.scheduledDate < today || (visit.startsAt && new Date(visit.startsAt) < now)) {
    throw new ScheduleStateError("La visita prevista no puede guardarse en el pasado.");
  }
}

async function checkOverlap(visit: ScheduledVisit, repository: ScheduledVisitRepository, acknowledge: boolean, excludedId?: string) {
  if (!visit.startsAt || acknowledge) return;
  const conflicts = (await repository.listOpen()).filter((item) => item.id !== excludedId && appointmentsOverlap(item, visit));
  if (conflicts.length) throw new ScheduleOverlapError(conflicts);
}

export async function createScheduledVisit(rawInput: unknown, dependencies: Dependencies) {
  const input = createScheduledVisitSchema.parse(rawInput);
  const existing = await dependencies.scheduledVisits.getById(`appointment-${input.clientAppointmentId}`);
  const now = (dependencies.clock ?? systemClock).now();
  const visit = createScheduledVisitFromInput(input, now.toISOString());
  if (existing) return dependencies.scheduledVisits.putIfAbsent(visit);
  await requireActiveContext(input.patientId, input.treatmentId, dependencies);
  ensureNotPast(visit, now);
  await checkOverlap(visit, dependencies.scheduledVisits, input.acknowledgeConflict);
  return dependencies.scheduledVisits.putIfAbsent(visit);
}

export async function rescheduleVisit(rawInput: unknown, dependencies: Dependencies) {
  const input = rescheduleVisitSchema.parse(rawInput);
  const original = await dependencies.scheduledVisits.getById(input.appointmentId);
  if (!original) throw new ScheduleStateError("La cita ya no está disponible para reprogramar.");
  const now = (dependencies.clock ?? systemClock).now();
  const replacement = createScheduledVisitFromInput({
    ...input,
    patientId: original.patientId,
    treatmentId: original.treatmentId,
  }, now.toISOString());
  if (original.status === "cancelled" && original.replacedById === replacement.id) {
    const confirmed = await dependencies.scheduledVisits.getById(replacement.id);
    if (confirmed?.replacesId === original.id) return { original, replacement: confirmed };
  }
  if (!["proposed", "booked"].includes(original.status)) throw new ScheduleStateError("La cita ya no está disponible para reprogramar.");
  if (original.version !== input.expectedVersion) throw new ScheduleStateError("La cita cambió en otro dispositivo. Recargá la pantalla.");
  await requireActiveContext(original.patientId, original.treatmentId, dependencies);
  ensureNotPast(replacement, now);
  await checkOverlap(replacement, dependencies.scheduledVisits, input.acknowledgeConflict, original.id);
  return dependencies.scheduledVisits.replace(
    { ...original, status: "cancelled", changeReason: input.reason, changeNote: input.note, replacedById: replacement.id },
    { ...replacement, replacesId: original.id },
  );
}

export async function closeScheduledVisit(
  rawInput: unknown,
  status: "cancelled" | "no-show",
  dependencies: Dependencies,
) {
  const input = closeScheduledVisitSchema.parse(rawInput);
  const visit = await dependencies.scheduledVisits.getById(input.appointmentId);
  if (!visit) throw new ScheduleStateError("La cita ya no está disponible.");
  if (visit.status === status && visit.changeReason === input.reason && visit.changeNote === input.note) return visit;
  if (!["proposed", "booked"].includes(visit.status)) throw new ScheduleStateError("La cita ya no está disponible.");
  if (visit.version !== input.expectedVersion) throw new ScheduleStateError("La cita cambió en otro dispositivo. Recargá la pantalla.");
  if (status === "no-show") {
    const now = (dependencies.clock ?? systemClock).now();
    const allowedAt = visit.startsAt ? new Date(visit.startsAt) : new Date(`${visit.scheduledDate}T23:59:59-03:00`);
    if (now < allowedAt) throw new ScheduleStateError("Todavía no corresponde marcar esta visita como no realizada.");
  }
  return dependencies.scheduledVisits.close({ ...visit, status, changeReason: input.reason, changeNote: input.note });
}
