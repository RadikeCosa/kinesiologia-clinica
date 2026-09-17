import { createVisitSchema, type FunctionalMetric, type Visit } from "@/domain/visit/visit";
import type { PatientRepository } from "@/application/patients/patient.repository";
import type { TreatmentRepository } from "@/application/treatments/treatment.repository";
import type { VisitRepository } from "./visit.repository";
import type { MetricRepository } from "./metric.repository";
import type { ScheduledVisitRepository } from "@/application/schedule/scheduled-visit.repository";
import type { ClinicalWorkflowRepository } from "./clinical-workflow.repository";
import type { ClinicalEvaluationRepository, PerformedProcedureRepository } from "./clinical-entry.repository";
import type { ClinicalEvaluation, PerformedProcedure, ProcedureFamily } from "@/domain/visit/clinical-entry";

export class VisitConflictError extends Error {
  constructor() { super("La identidad de esta visita ya corresponde a otro contenido."); }
}

function matchesRequestedVisit(existing: Visit, expected: Visit): boolean {
  return existing.patientId === expected.patientId &&
    existing.treatmentId === expected.treatmentId &&
    existing.status === expected.status &&
    existing.startedAt === expected.startedAt && existing.endedAt === expected.endedAt &&
    existing.captureMode === expected.captureMode &&
    existing.appointmentId === expected.appointmentId &&
    existing.clinicalNote?.statusAndResponse === expected.clinicalNote?.statusAndResponse &&
    existing.clinicalNote?.intervention === expected.clinicalNote?.intervention &&
    (existing.clinicalNote?.nextPlan ?? "") === (expected.clinicalNote?.nextPlan ?? "");
}

export async function createVisit(rawInput: unknown, dependencies: {
  patients: Pick<PatientRepository, "getById">;
  treatments: Pick<TreatmentRepository, "getById">;
  visits: Pick<VisitRepository, "getById" | "put">;
  metrics: Pick<MetricRepository, "listByVisitId" | "putIfAbsent">;
  scheduledVisits?: ScheduledVisitRepository;
  workflow?: ClinicalWorkflowRepository;
  evaluations?: ClinicalEvaluationRepository;
  procedures?: PerformedProcedureRepository;
}) {
  const input = createVisitSchema.parse(rawInput);
  const id = input.appointmentId?.startsWith("appointment-") ? `visit-${input.appointmentId.slice("appointment-".length)}` : `visit-${input.clientVisitId}`;
  const expected: Visit = {
    id,
    patientId: input.patientId,
    treatmentId: input.treatmentId,
    status: "finished",
    startedAt: input.startedAt,
    endedAt: input.endedAt,
    captureMode: input.captureMode,
    appointmentId: input.appointmentId,
    recordedAt: new Date().toISOString(),
    clinicalNote: input.clinicalNote,
  };
  const [patient, treatment, existing, appointment] = await Promise.all([
    dependencies.patients.getById(input.patientId),
    dependencies.treatments.getById(input.treatmentId),
    dependencies.visits.getById(id),
    input.appointmentId && dependencies.scheduledVisits ? dependencies.scheduledVisits.getById(input.appointmentId) : null,
  ]);
  if (!patient || !treatment || treatment.patientId !== patient.id) {
    throw new Error("El paciente o tratamiento no está disponible.");
  }
  if (input.appointmentId && (!appointment || appointment.patientId !== input.patientId || appointment.treatmentId !== input.treatmentId || !["proposed", "booked", "fulfilled"].includes(appointment.status))) {
    throw new Error("La cita seleccionada no está disponible.");
  }
  const metricValues: FunctionalMetric[] = input.metrics.map((metric) => {
    const suffix = { tug_seconds: "tug", pain_nrs_0_10: "pain", standing_tolerance_minutes: "standing", gait_duration_minutes: "gait" }[metric.code];
    return { id: `obs-${input.clientVisitId}-${suffix}`, patientId: input.patientId, visitId: id, code: metric.code, value: metric.value, effectiveDateTime: input.startedAt, unit: metric.code === "tug_seconds" ? "s" : metric.code === "pain_nrs_0_10" ? "score" : "min" };
  });
  const procedureSuffix: Record<ProcedureFamily, string> = { "therapeutic-exercise": "exercise", "manual-therapy": "manual", "gait-transfers": "gait", respiratory: "resp", "education-instructions": "education", "environment-assistive-devices": "environment", other: "other" };
  const evaluations: ClinicalEvaluation[] = input.clinicalEntries.evaluations.map((item) => ({ ...item, id: `evaluation-${item.clientId}`, patientId: input.patientId, visitId: id, effectiveDateTime: input.startedAt }));
  const procedures: PerformedProcedure[] = input.clinicalEntries.procedures.map((item) => ({ ...item, id: `proc-${id.replace(/^visit-/, "").slice(0, 36)}-${procedureSuffix[item.family]}`.slice(0, 64), patientId: input.patientId, visitId: id, performedStart: input.startedAt, performedEnd: input.endedAt }));
  if (existing) {
    if (!matchesRequestedVisit(existing, expected)) throw new VisitConflictError();
    const existingMetrics = await dependencies.metrics.listByVisitId(id);
    if (existingMetrics.some((item) => !input.metrics.some((metric) => metric.code === item.code && metric.value === item.value))) {
      throw new VisitConflictError();
    }
  } else {
    if (treatment.status !== "active") throw new Error("El tratamiento activo no está disponible.");
    if (dependencies.workflow) {
      await dependencies.workflow.completeRetrospective(expected, metricValues, evaluations, procedures, appointment ? { ...appointment, status: "fulfilled" } : undefined);
    } else {
      if (!dependencies.evaluations || !dependencies.procedures) {
        throw new Error("La visita clínica no tiene repositorios para guardar sus entradas.");
      }
      await dependencies.visits.put(expected);
      for (const evaluation of evaluations) await dependencies.evaluations.putIfAbsent(evaluation);
      for (const procedure of procedures) await dependencies.procedures.putIfAbsent(procedure);
    }
  }
  if (!(appointment && dependencies.workflow && !existing)) {
    for (const value of metricValues) await dependencies.metrics.putIfAbsent(value);
  }
  const [existingEvaluations, existingProcedures] = await Promise.all([
    dependencies.evaluations?.listByVisitId(id) ?? Promise.resolve([]), dependencies.procedures?.listByVisitId(id) ?? Promise.resolve([]),
  ]);
  if (existing) {
    const managedEvaluations = existingEvaluations.filter((item) => item.id.startsWith("evaluation-"));
    const sameEvaluations = managedEvaluations.length === evaluations.length && evaluations.every((expectedEvaluation) => managedEvaluations.some((actual) => actual.id === expectedEvaluation.id && actual.seriesId === expectedEvaluation.seriesId && actual.domain === expectedEvaluation.domain && actual.name === expectedEvaluation.name && JSON.stringify(actual.result) === JSON.stringify(expectedEvaluation.result) && JSON.stringify(actual.context ?? {}) === JSON.stringify(expectedEvaluation.context ?? {})));
    const sameProcedures = existingProcedures.length === procedures.length && procedures.every((expectedProcedure) => existingProcedures.some((actual) => actual.id === expectedProcedure.id && actual.family === expectedProcedure.family && (actual.otherName ?? "") === (expectedProcedure.otherName ?? "")));
    if (!sameEvaluations || !sameProcedures) throw new VisitConflictError();
  }
  const confirmed = await dependencies.visits.getById(id);
  if (!confirmed) throw new Error("La visita todavía no pudo confirmarse desde el servidor.");
  if (!matchesRequestedVisit(confirmed, expected)) throw new VisitConflictError();
  const confirmedMetrics = await dependencies.metrics.listByVisitId(id);
  if (input.metrics.some((metric) => !confirmedMetrics.some((item) => item.code === metric.code && item.value === metric.value))) {
    throw new Error("Las métricas todavía no pudieron confirmarse desde el servidor.");
  }
  return { visit: confirmed, metrics: confirmedMetrics, evaluations: existing ? existingEvaluations : evaluations, procedures: existing ? existingProcedures : procedures };
}
