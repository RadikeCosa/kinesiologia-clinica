import { z } from "zod";
import type { PatientRepository } from "@/application/patients/patient.repository";
import type { ScheduledVisitRepository } from "@/application/schedule/scheduled-visit.repository";
import type { TreatmentRepository } from "@/application/treatments/treatment.repository";
import type { ClinicalWorkflowRepository } from "./clinical-workflow.repository";
import type { MetricRepository } from "./metric.repository";
import type { VisitRepository } from "./visit.repository";
import { metricCodeSchema, type FunctionalMetric, type Visit } from "@/domain/visit/visit";
import { visitClinicalEntriesSchema, type ClinicalEvaluation, type PerformedProcedure, type ProcedureFamily } from "@/domain/visit/clinical-entry";
import type { ClinicalEvaluationRepository, PerformedProcedureRepository } from "./clinical-entry.repository";
import type { Clock } from "@/application/schedule/manage-scheduled-visits";
import { systemClock } from "@/application/schedule/manage-scheduled-visits";

const resourceId = z.string().regex(/^[A-Za-z0-9.-]{1,64}$/);
const noteSchema = z.object({
  statusAndResponse: z.string().trim().min(1).max(2000),
  intervention: z.string().trim().min(1).max(2000),
  nextPlan: z.string().trim().max(2000).optional(),
});

const startVisitSchema = z.object({
  clientVisitId: z.uuid(), patientId: resourceId, treatmentId: resourceId, appointmentId: resourceId.optional(),
});
const finishVisitSchema = z.object({
  visitId: resourceId, expectedVersion: z.string().min(1), clinicalNote: noteSchema,
  metrics: z.array(z.object({ code: metricCodeSchema, value: z.number().finite().nonnegative() })).max(4).default([]),
  clinicalEntries: visitClinicalEntriesSchema.default({ evaluations: [], procedures: [] }),
});
const annulVisitSchema = z.object({ visitId: resourceId, expectedVersion: z.string().min(1) });

type Dependencies = {
  patients: PatientRepository;
  treatments: TreatmentRepository;
  visits: VisitRepository;
  metrics: MetricRepository;
  scheduledVisits: ScheduledVisitRepository;
  workflow: ClinicalWorkflowRepository;
  evaluations?: ClinicalEvaluationRepository;
  procedures?: PerformedProcedureRepository;
  clock?: Clock;
};

let startQueue: Promise<void> = Promise.resolve();

async function withStartLock<T>(operation: () => Promise<T>) {
  const previous = startQueue;
  let release!: () => void;
  startQueue = new Promise<void>((resolve) => { release = resolve; });
  await previous;
  try {
    return await operation();
  } finally {
    release();
  }
}

export class ActiveVisitError extends Error {
  constructor(readonly activeVisit: Visit) { super("Ya existe una visita en curso."); }
}

export class VisitStateError extends Error {}

async function requireContext(patientId: string, treatmentId: string, dependencies: Dependencies) {
  const [patient, treatment] = await Promise.all([dependencies.patients.getById(patientId), dependencies.treatments.getById(treatmentId)]);
  if (!patient || !treatment || treatment.patientId !== patient.id || treatment.status !== "active") {
    throw new VisitStateError("El paciente o tratamiento activo no está disponible.");
  }
}

function visitId(clientVisitId: string, appointmentId?: string) {
  return appointmentId?.startsWith("appointment-") ? `visit-${appointmentId.slice("appointment-".length)}` : `visit-${clientVisitId}`;
}

const procedureSuffix: Record<ProcedureFamily, string> = { "therapeutic-exercise": "exercise", "manual-therapy": "manual", "gait-transfers": "gait", respiratory: "resp", "education-instructions": "education", "environment-assistive-devices": "environment", other: "other" };
function buildEntries(visit: Visit, input: z.infer<typeof visitClinicalEntriesSchema>, end: string) {
  const evaluations: ClinicalEvaluation[] = input.evaluations.map((item) => ({ ...item, id: `evaluation-${item.clientId}`, patientId: visit.patientId, visitId: visit.id, effectiveDateTime: visit.startedAt }));
  const procedures: PerformedProcedure[] = input.procedures.map((item) => ({ ...item, id: `proc-${visit.id.replace(/^visit-/, "").slice(0, 36)}-${procedureSuffix[item.family]}`.slice(0, 64), patientId: visit.patientId, visitId: visit.id, performedStart: visit.startedAt, performedEnd: end }));
  return { evaluations, procedures };
}

export async function startVisit(rawInput: unknown, dependencies: Dependencies) {
  return withStartLock(async () => {
    const input = startVisitSchema.parse(rawInput);
    const id = visitId(input.clientVisitId, input.appointmentId);
    const existing = await dependencies.visits.getById(id);
    if (existing?.status === "in-progress") return existing;
    if (existing) throw new VisitStateError("Esta visita ya fue registrada y no puede volver a iniciarse.");
    const active = (await dependencies.visits.listInProgress())[0];
    if (active) throw new ActiveVisitError(active);
    await requireContext(input.patientId, input.treatmentId, dependencies);
    const appointment = input.appointmentId ? await dependencies.scheduledVisits.getById(input.appointmentId) : null;
    if (input.appointmentId && (!appointment || !["booked", "proposed"].includes(appointment.status) || (appointment.status === "booked" && !appointment.startsAt) || appointment.patientId !== input.patientId || appointment.treatmentId !== input.treatmentId)) {
      throw new VisitStateError("La cita ya no está disponible para comenzar.");
    }
    const now = (dependencies.clock ?? systemClock).now().toISOString();
    const visit: Visit = { id, patientId: input.patientId, treatmentId: input.treatmentId, appointmentId: appointment?.id, status: "in-progress", startedAt: now, captureMode: "live" };
    await dependencies.workflow.start(visit, appointment ? { ...appointment, status: "fulfilled" } : undefined);
    const confirmed = await dependencies.visits.getById(id);
    if (!confirmed || confirmed.status !== "in-progress") throw new Error("El inicio todavía no pudo confirmarse.");
    return confirmed;
  });
}

export async function annulVisitStart(rawInput: unknown, dependencies: Dependencies) {
  const input = annulVisitSchema.parse(rawInput);
  const visit = await dependencies.visits.getById(input.visitId);
  if (visit?.status === "entered-in-error") return visit;
  if (!visit || visit.status !== "in-progress" || visit.version !== input.expectedVersion) throw new VisitStateError("La visita cambió. Recargá la pantalla.");
  const appointment = visit.appointmentId ? await dependencies.scheduledVisits.getById(visit.appointmentId) : null;
  await dependencies.workflow.annul(
    { ...visit, status: "entered-in-error" },
    appointment?.status === "fulfilled" ? { ...appointment, status: appointment.startsAt ? "booked" : "proposed" } : undefined,
  );
}

export async function finishVisit(rawInput: unknown, dependencies: Dependencies) {
  const input = finishVisitSchema.parse(rawInput);
  const visit = await dependencies.visits.getById(input.visitId);
  if (visit?.status === "finished") {
    const [confirmedMetrics, evaluations, procedures] = await Promise.all([dependencies.metrics.listByVisitId(visit.id), dependencies.evaluations?.listByVisitId(visit.id) ?? Promise.resolve([]), dependencies.procedures?.listByVisitId(visit.id) ?? Promise.resolve([])]);
    const sameNote = JSON.stringify(visit.clinicalNote) === JSON.stringify(input.clinicalNote);
    const sameMetrics = confirmedMetrics.length === input.metrics.length && input.metrics.every((expected) => confirmedMetrics.some((actual) => actual.code === expected.code && actual.value === expected.value));
    const expectedEntries = buildEntries(visit, input.clinicalEntries, visit.endedAt ?? visit.startedAt);
    const managedEvaluations = evaluations.filter((item) => item.id.startsWith("evaluation-"));
    const sameEvaluations = managedEvaluations.length === expectedEntries.evaluations.length && expectedEntries.evaluations.every((expected) => managedEvaluations.some((actual) => actual.id === expected.id && actual.seriesId === expected.seriesId && actual.domain === expected.domain && actual.name === expected.name && JSON.stringify(actual.result) === JSON.stringify(expected.result) && JSON.stringify(actual.context ?? {}) === JSON.stringify(expected.context ?? {})));
    const sameProcedures = procedures.length === expectedEntries.procedures.length && expectedEntries.procedures.every((expected) => procedures.some((actual) => actual.id === expected.id && actual.family === expected.family && (actual.otherName ?? "") === (expected.otherName ?? "")));
    if (sameNote && sameMetrics && sameEvaluations && sameProcedures) return { visit, metrics: confirmedMetrics, evaluations, procedures };
    throw new VisitStateError("La visita ya fue finalizada con otros datos. Recargá la pantalla.");
  }
  if (!visit || visit.status !== "in-progress" || visit.version !== input.expectedVersion) throw new VisitStateError("La visita cambió. Recargá la pantalla.");
  const now = (dependencies.clock ?? systemClock).now();
  if (now < new Date(visit.startedAt)) throw new VisitStateError("La finalización no puede ser anterior al inicio.");
  const finished: Visit = { ...visit, status: "finished", endedAt: now.toISOString(), recordedAt: now.toISOString(), clinicalNote: input.clinicalNote };
  const stable = visit.id.replace(/^visit-/, "");
  const metrics: FunctionalMetric[] = input.metrics.map((metric) => ({
    id: `obs-${stable}-${metric.code.replace(/_/g, "-")}`.slice(0, 64),
    patientId: visit.patientId, visitId: visit.id, code: metric.code, value: metric.value,
    effectiveDateTime: visit.startedAt,
    unit: metric.code === "tug_seconds" ? "s" : metric.code === "pain_nrs_0_10" ? "score" : "min",
  }));
  const entries = buildEntries(finished, input.clinicalEntries, finished.endedAt!);
  await dependencies.workflow.finish(finished, metrics, entries.evaluations, entries.procedures);
  const [confirmed, confirmedMetrics, confirmedEvaluations, confirmedProcedures] = await Promise.all([dependencies.visits.getById(visit.id), dependencies.metrics.listByVisitId(visit.id), dependencies.evaluations?.listByVisitId(visit.id) ?? Promise.resolve(entries.evaluations), dependencies.procedures?.listByVisitId(visit.id) ?? Promise.resolve(entries.procedures)]);
  if (!confirmed || confirmed.status !== "finished" || confirmedMetrics.length < metrics.length || confirmedEvaluations.length < entries.evaluations.length || confirmedProcedures.length < entries.procedures.length) throw new Error("La visita todavía no pudo confirmarse.");
  return { visit: confirmed, metrics: confirmedMetrics, evaluations: confirmedEvaluations, procedures: confirmedProcedures };
}
