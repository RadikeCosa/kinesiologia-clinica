import { z } from "zod";
import type { Clock } from "@/application/schedule/manage-scheduled-visits";
import { systemClock } from "@/application/schedule/manage-scheduled-visits";
import { visitClinicalEntriesSchema, type ClinicalEvaluation, type PerformedProcedure, type ProcedureFamily } from "@/domain/visit/clinical-entry";
import type { Visit } from "@/domain/visit/visit";
import type { ScheduledVisitRepository } from "@/application/schedule/scheduled-visit.repository";
import type { ClinicalEvaluationRepository, PerformedProcedureRepository } from "./clinical-entry.repository";
import type { ClinicalWorkflowRepository } from "./clinical-workflow.repository";
import type { MetricRepository } from "./metric.repository";
import type { VisitRepository } from "./visit.repository";
import { VisitStateError } from "./manage-visit-workflow";

const id = z.string().regex(/^[A-Za-z0-9.-]{1,64}$/);
const reason = z.string().trim().min(5, "Explicá brevemente el motivo de la corrección.").max(500);
const correctSchema = z.object({
  patientId: id, visitId: id, expectedVersion: z.string().min(1),
  startedAt: z.iso.datetime({ offset: true }), endedAt: z.iso.datetime({ offset: true }),
  reason,
  clinicalNote: z.object({
    statusAndResponse: z.string().trim().min(1).max(2000),
    intervention: z.string().trim().min(1).max(2000),
    nextPlan: z.string().trim().max(2000).optional(),
  }),
  clinicalEntries: visitClinicalEntriesSchema,
}).superRefine((value, context) => {
  if (new Date(value.endedAt) < new Date(value.startedAt)) context.addIssue({ code: "custom", path: ["endedAt"], message: "La salida debe ser posterior a la entrada." });
});
const annulSchema = z.object({ patientId: id, visitId: id, expectedVersion: z.string().min(1), reason });

type Dependencies = {
  visits: VisitRepository;
  metrics: MetricRepository;
  evaluations: ClinicalEvaluationRepository;
  procedures: PerformedProcedureRepository;
  scheduledVisits: ScheduledVisitRepository;
  workflow: Pick<ClinicalWorkflowRepository, "correct" | "annulFinished">;
  clock?: Clock;
};

const suffix: Record<ProcedureFamily, string> = { "therapeutic-exercise": "exercise", "manual-therapy": "manual", "gait-transfers": "gait", respiratory: "resp", "education-instructions": "education", "environment-assistive-devices": "environment", other: "other" };

function requireFinished(visit: Visit | null, patientId: string, expectedVersion: string): Visit {
  if (!visit || visit.patientId !== patientId || visit.status !== "finished") throw new VisitStateError("La visita ya no está disponible para corregir. Recargá la pantalla.");
  if (visit.version !== expectedVersion) throw new VisitStateError("La visita cambió en otro dispositivo. Recargá la pantalla antes de corregirla.");
  return visit;
}

export async function correctFinishedVisit(rawInput: unknown, dependencies: Dependencies) {
  const input = correctSchema.parse(rawInput);
  const visit = await dependencies.visits.getById(input.visitId);
  if (!visit || visit.patientId !== input.patientId || visit.status !== "finished") throw new VisitStateError("La visita ya no está disponible para corregir. Recargá la pantalla.");
  const [previousEvaluations, previousProcedures, metrics] = await Promise.all([
    dependencies.evaluations.listByVisitId(visit.id), dependencies.procedures.listByVisitId(visit.id), dependencies.metrics.listByVisitId(visit.id),
  ]);
  const managedEvaluations = previousEvaluations.filter((item) => item.id.startsWith("evaluation-"));
  if (visit.version !== input.expectedVersion) {
    const sameNote = visit.clinicalNote?.statusAndResponse === input.clinicalNote.statusAndResponse && visit.clinicalNote?.intervention === input.clinicalNote.intervention && (visit.clinicalNote?.nextPlan ?? "") === (input.clinicalNote.nextPlan ?? "");
    const sameEvaluations = managedEvaluations.length === input.clinicalEntries.evaluations.length && input.clinicalEntries.evaluations.every((requested) => managedEvaluations.some((saved) => saved.clientId === requested.clientId && saved.seriesId === requested.seriesId && saved.domain === requested.domain && saved.name === requested.name && JSON.stringify(saved.result) === JSON.stringify(requested.result) && JSON.stringify(saved.context ?? {}) === JSON.stringify(requested.context ?? {})));
    const sameProcedures = previousProcedures.length === input.clinicalEntries.procedures.length && input.clinicalEntries.procedures.every((requested) => previousProcedures.some((saved) => saved.family === requested.family && (saved.otherName ?? "") === (requested.otherName ?? "")));
    if (visit.correctionReason === input.reason && visit.startedAt === input.startedAt && visit.endedAt === input.endedAt && sameNote && sameEvaluations && sameProcedures) return visit;
    throw new VisitStateError("La visita cambió en otro dispositivo. Recargá la pantalla antes de corregirla.");
  }
  const oldEvaluations = new Map(managedEvaluations.map((item) => [item.clientId, item]));
  const oldProcedures = new Map(previousProcedures.map((item) => [item.family, item]));
  const nextEvaluations: ClinicalEvaluation[] = input.clinicalEntries.evaluations.map((item) => {
    const previous = oldEvaluations.get(item.clientId);
    if (previous && previous.seriesId !== item.seriesId) throw new VisitStateError("La identidad de una evaluación cambió. Recargá la pantalla.");
    return { ...item, id: previous?.id ?? `evaluation-${item.clientId}`, patientId: visit.patientId, visitId: visit.id, effectiveDateTime: input.startedAt,
      ...(previous ? { status: "corrected" as const, version: previous.version } : {}) };
  });
  const retiredEvaluations = managedEvaluations.filter((item) => !input.clinicalEntries.evaluations.some((entry) => entry.clientId === item.clientId)).map((item) => ({ ...item, status: "entered-in-error" as const }));
  const nextProcedures: PerformedProcedure[] = input.clinicalEntries.procedures.map((item) => {
    const previous = oldProcedures.get(item.family);
    return { ...item, id: previous?.id ?? `proc-${visit.id.replace(/^visit-/, "").slice(0, 36)}-${suffix[item.family]}`.slice(0, 64), patientId: visit.patientId, visitId: visit.id, performedStart: input.startedAt, performedEnd: input.endedAt,
      ...(previous ? { status: "completed" as const, version: previous.version } : {}) };
  });
  const retiredProcedures = previousProcedures.filter((item) => !input.clinicalEntries.procedures.some((entry) => entry.family === item.family)).map((item) => ({ ...item, status: "entered-in-error" as const }));
  const corrected: Visit = { ...visit, startedAt: input.startedAt, endedAt: input.endedAt, clinicalNote: input.clinicalNote,
    correctedAt: (dependencies.clock ?? systemClock).now().toISOString(), correctionReason: input.reason };
  const changedMetrics = visit.startedAt === input.startedAt ? [] : metrics.map((item) => ({ ...item, effectiveDateTime: input.startedAt, status: "corrected" as const }));
  await dependencies.workflow.correct(corrected, changedMetrics, [...nextEvaluations, ...retiredEvaluations], [...nextProcedures, ...retiredProcedures]);
  const confirmed = await dependencies.visits.getById(visit.id);
  if (!confirmed || confirmed.version === visit.version || confirmed.correctionReason !== input.reason) throw new Error("La corrección todavía no pudo confirmarse.");
  return confirmed;
}

export async function annulFinishedVisit(rawInput: unknown, dependencies: Dependencies) {
  const input = annulSchema.parse(rawInput);
  const current = await dependencies.visits.getById(input.visitId);
  if (current?.status === "entered-in-error" && current.patientId === input.patientId && current.annulReason === input.reason) return current;
  const visit = requireFinished(current, input.patientId, input.expectedVersion);
  const [metrics, evaluations, procedures, appointment] = await Promise.all([
    dependencies.metrics.listByVisitId(visit.id), dependencies.evaluations.listByVisitId(visit.id), dependencies.procedures.listByVisitId(visit.id),
    visit.appointmentId ? dependencies.scheduledVisits.getById(visit.appointmentId) : Promise.resolve(null),
  ]);
  const annulled: Visit = { ...visit, status: "entered-in-error", annulledAt: (dependencies.clock ?? systemClock).now().toISOString(), annulReason: input.reason };
  const restoredAppointment = appointment?.status === "fulfilled" ? { ...appointment, status: appointment.startsAt ? "booked" as const : "proposed" as const } : undefined;
  await dependencies.workflow.annulFinished(
    annulled,
    metrics.map((item) => ({ ...item, status: "entered-in-error" })),
    evaluations.filter((item) => item.id.startsWith("evaluation-")).map((item) => ({ ...item, status: "entered-in-error" })),
    procedures.map((item) => ({ ...item, status: "entered-in-error" })),
    restoredAppointment,
  );
  const confirmed = await dependencies.visits.getById(visit.id);
  if (!confirmed || confirmed.status !== "entered-in-error") throw new Error("La anulación todavía no pudo confirmarse.");
  return confirmed;
}
