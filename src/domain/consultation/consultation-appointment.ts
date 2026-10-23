import { z } from "zod";

export type EvaluationAppointmentStatus = "proposed" | "confirmed" | "realized" | "cancelled" | "not-performed";
export type EvaluationAppointmentReason = "patient-or-family" | "professional" | "health-event" | "logistics-or-weather" | "other";

export interface EvaluationAppointment {
  id: string;
  consultationId: string;
  patientId: string;
  status: EvaluationAppointmentStatus;
  scheduledDate: string;
  startsAt?: string;
  endsAt?: string;
  durationMinutes?: number;
  createdAt: string;
  replacesId?: string;
  replacedById?: string;
  reason?: EvaluationAppointmentReason;
  note?: string;
  version?: string;
}

export const evaluationAppointmentInputSchema = z.object({
  clientAppointmentId: z.uuid(),
  scheduledDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
    const date = new Date(`${value}T12:00:00.000Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }, "Elegí una fecha válida."),
  startsAt: z.iso.datetime({ offset: true }).optional(),
  durationMinutes: z.number().int().min(15).max(240).default(60),
}).superRefine((value, context) => {
  if (!value.startsAt) return;
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value.startsAt));
  if (date !== value.scheduledDate) context.addIssue({ code: "custom", path: ["startsAt"], message: "La fecha y la hora de la visita no coinciden." });
});

export function createEvaluationAppointment(input: z.infer<typeof evaluationAppointmentInputSchema> & { consultationId: string; patientId: string; createdAt: string }): EvaluationAppointment {
  const value = evaluationAppointmentInputSchema.parse(input);
  const startsAt = value.startsAt;
  return {
    id: `evaluation-appointment-${value.clientAppointmentId}`,
    consultationId: input.consultationId,
    patientId: input.patientId,
    status: startsAt ? "confirmed" : "proposed",
    scheduledDate: value.scheduledDate,
    startsAt,
    endsAt: startsAt ? new Date(new Date(startsAt).getTime() + value.durationMinutes * 60_000).toISOString() : undefined,
    durationMinutes: startsAt ? value.durationMinutes : undefined,
    createdAt: input.createdAt,
  };
}
