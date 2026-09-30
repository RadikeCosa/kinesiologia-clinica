import type { Visit } from "@/domain/visit/visit";

export interface TreatmentPeriod {
  id: string;
  treatmentId: string;
  patientId: string;
  ordinal: number;
  quota?: number;
  frequency?: string;
  phase: "open" | "report-pending" | "reported" | "closed";
  closure?: "quota" | "partial";
  partialReason?: string;
  available: boolean;
  clinicalRevision: number;
  currentReportId?: string;
  version?: string;
}
export class PeriodStateError extends Error {}
export function validQuota(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 500;
}
export function periodVisits(period: TreatmentPeriod, visits: Visit[]) {
  return [...new Map(visits.filter(v => v.treatmentId === period.treatmentId && (v.periodId === period.id || (!v.periodId && period.ordinal === 1))).map(v => [v.id, v])).values()];
}
export function periodCount(period: TreatmentPeriod, visits: Visit[]) {
  const own = periodVisits(period, visits);
  return { completed: own.filter(v => v.status === "finished").length, reserved: own.filter(v => v.status === "in-progress").length };
}
export function reconcilePeriod(period: TreatmentPeriod, visits: Visit[]): TreatmentPeriod {
  if (period.phase === "closed" || period.phase === "reported" || period.closure === "partial") return period;
  const count = periodCount(period, visits);
  const complete = validQuota(period.quota) && count.completed >= period.quota && count.reserved === 0;
  return { ...period, phase: complete ? "report-pending" : "open", closure: complete ? "quota" : undefined };
}
export function admissionIssue(period: TreatmentPeriod, visits: Visit[]): string | null {
  const current = reconcilePeriod(period, visits), count = periodCount(current, visits);
  if (!validQuota(current.quota)) return "Definir cupo del período antes de registrar otra visita.";
  if (!current.available) return "El tratamiento no está disponible para atender.";
  if (current.phase !== "open") return "Revisar informe para continuar: guardá el informe y renová el período.";
  if (count.reserved) return "Ya hay una visita en curso en este tratamiento.";
  if (count.completed + count.reserved >= current.quota) return "El cupo del período está ocupado. Guardá el informe y renová para continuar.";
  return null;
}
export function admitVisit(period: TreatmentPeriod, visits: Visit[]) {
  const issue = admissionIssue(period, visits);
  if (issue) throw new PeriodStateError(issue);
}
