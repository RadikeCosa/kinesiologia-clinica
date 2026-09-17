import { z } from "zod";

export const scheduleChangeReasonSchema = z.enum([
  "patient-or-family",
  "professional",
  "health-event",
  "logistics-or-weather",
  "other",
]);

export type ScheduleChangeReason = z.infer<typeof scheduleChangeReasonSchema>;
export type ScheduledVisitStatus = "proposed" | "booked" | "fulfilled" | "cancelled" | "no-show";

export interface ScheduledVisit {
  id: string;
  patientId: string;
  treatmentId: string;
  status: ScheduledVisitStatus;
  scheduledDate: string;
  startsAt?: string;
  endsAt?: string;
  durationMinutes?: number;
  createdAt: string;
  updatedAt?: string;
  changeReason?: ScheduleChangeReason;
  changeNote?: string;
  replacesId?: string;
  replacedById?: string;
  version?: string;
}

const localDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Elegí una fecha válida.").refine((value) => {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}, "Elegí una fecha válida.");

const localTimeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Elegí un horario válido.");
const resourceIdSchema = z.string().regex(/^[A-Za-z0-9.-]{1,64}$/);

export const scheduleSlotSchema = z.object({
  date: localDateSchema,
  time: localTimeSchema.optional(),
  durationMinutes: z.number().int().min(15).max(240).default(60),
});

export const createScheduledVisitSchema = scheduleSlotSchema.extend({
  clientAppointmentId: z.uuid(),
  patientId: resourceIdSchema,
  treatmentId: resourceIdSchema,
  acknowledgeConflict: z.boolean().default(false),
});

export const rescheduleVisitSchema = scheduleSlotSchema.extend({
  appointmentId: resourceIdSchema,
  expectedVersion: z.string().trim().min(1),
  clientAppointmentId: z.uuid(),
  reason: scheduleChangeReasonSchema,
  note: z.string().trim().max(500).optional(),
  acknowledgeConflict: z.boolean().default(false),
});

export const closeScheduledVisitSchema = z.object({
  appointmentId: resourceIdSchema,
  expectedVersion: z.string().trim().min(1),
  reason: scheduleChangeReasonSchema,
  note: z.string().trim().max(500).optional(),
});

export type CreateScheduledVisitInput = z.infer<typeof createScheduledVisitSchema>;
export type RescheduleVisitInput = z.infer<typeof rescheduleVisitSchema>;
export type CloseScheduledVisitInput = z.infer<typeof closeScheduledVisitSchema>;

export function toBuenosAiresInstant(date: string, time: string): string {
  return `${date}T${time}:00-03:00`;
}

export function addMinutes(instant: string, minutes: number): string {
  return new Date(new Date(instant).getTime() + minutes * 60_000).toISOString();
}

export function nextLocalDate(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + 1));
  return next.toISOString().slice(0, 10);
}

export function createScheduledVisitFromInput(
  input: CreateScheduledVisitInput,
  createdAt: string,
): ScheduledVisit {
  const startsAt = input.time ? toBuenosAiresInstant(input.date, input.time) : undefined;
  return {
    id: `appointment-${input.clientAppointmentId}`,
    patientId: input.patientId,
    treatmentId: input.treatmentId,
    status: startsAt ? "booked" : "proposed",
    scheduledDate: input.date,
    startsAt,
    endsAt: startsAt ? addMinutes(startsAt, input.durationMinutes) : undefined,
    durationMinutes: input.time ? input.durationMinutes : undefined,
    createdAt,
  };
}

export function appointmentsOverlap(first: ScheduledVisit, second: ScheduledVisit): boolean {
  if (!first.startsAt || !first.endsAt || !second.startsAt || !second.endsAt) return false;
  return new Date(first.startsAt) < new Date(second.endsAt) && new Date(second.startsAt) < new Date(first.endsAt);
}
