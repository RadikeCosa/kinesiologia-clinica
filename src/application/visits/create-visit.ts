import { createVisitSchema, type FunctionalMetric, type Visit } from "@/domain/visit/visit";
import type { PatientRepository } from "@/application/patients/patient.repository";
import type { TreatmentRepository } from "@/application/treatments/treatment.repository";
import type { VisitRepository } from "./visit.repository";
import type { MetricRepository } from "./metric.repository";

export class VisitConflictError extends Error {
  constructor() { super("La identidad de esta visita ya corresponde a otro contenido."); }
}

function matchesRequestedVisit(existing: Visit, expected: Visit): boolean {
  return existing.patientId === expected.patientId &&
    existing.treatmentId === expected.treatmentId &&
    existing.status === expected.status &&
    existing.startedAt === expected.startedAt && existing.endedAt === expected.endedAt &&
    existing.captureMode === expected.captureMode &&
    existing.clinicalNote?.subjective === expected.clinicalNote?.subjective &&
    existing.clinicalNote?.intervention === expected.clinicalNote?.intervention &&
    existing.clinicalNote?.assessment === expected.clinicalNote?.assessment &&
    (existing.clinicalNote?.nextPlan ?? "") === (expected.clinicalNote?.nextPlan ?? "");
}

export async function createVisit(rawInput: unknown, dependencies: {
  patients: PatientRepository;
  treatments: TreatmentRepository;
  visits: VisitRepository;
  metrics: MetricRepository;
}) {
  const input = createVisitSchema.parse(rawInput);
  const id = `visit-${input.clientVisitId}`;
  const expected: Visit = {
    id,
    patientId: input.patientId,
    treatmentId: input.treatmentId,
    status: "finished",
    startedAt: input.startedAt,
    endedAt: input.endedAt,
    captureMode: input.captureMode,
    recordedAt: new Date().toISOString(),
    clinicalNote: input.clinicalNote,
  };
  const [patient, treatment, existing] = await Promise.all([
    dependencies.patients.getById(input.patientId),
    dependencies.treatments.getById(input.treatmentId),
    dependencies.visits.getById(id),
  ]);
  if (!patient || !treatment || treatment.patientId !== patient.id) {
    throw new Error("El paciente o tratamiento no está disponible.");
  }
  if (existing) {
    if (!matchesRequestedVisit(existing, expected)) throw new VisitConflictError();
    const existingMetrics = await dependencies.metrics.listByVisitId(id);
    if (existingMetrics.some((item) => !input.metrics.some((metric) => metric.code === item.code && metric.value === item.value))) {
      throw new VisitConflictError();
    }
  } else {
    if (treatment.status !== "active") throw new Error("El tratamiento activo no está disponible.");
    await dependencies.visits.put(expected);
  }
  for (const metric of input.metrics) {
    const suffix = {
      tug_seconds: "tug", pain_nrs_0_10: "pain",
      standing_tolerance_minutes: "standing", gait_duration_minutes: "gait",
    }[metric.code];
    const value: FunctionalMetric = {
      id: `obs-${input.clientVisitId}-${suffix}`,
      patientId: input.patientId,
      visitId: id,
      code: metric.code,
      value: metric.value,
      effectiveDateTime: input.startedAt,
      unit: metric.code === "tug_seconds" ? "s" : metric.code === "pain_nrs_0_10" ? "score" : "min",
    };
    await dependencies.metrics.putIfAbsent(value);
  }
  const confirmed = await dependencies.visits.getById(id);
  if (!confirmed) throw new Error("La visita todavía no pudo confirmarse desde el servidor.");
  if (!matchesRequestedVisit(confirmed, expected)) throw new VisitConflictError();
  const confirmedMetrics = await dependencies.metrics.listByVisitId(id);
  if (input.metrics.some((metric) => !confirmedMetrics.some((item) => item.code === metric.code && item.value === metric.value))) {
    throw new Error("Las métricas todavía no pudieron confirmarse desde el servidor.");
  }
  return { visit: confirmed, metrics: confirmedMetrics };
}
