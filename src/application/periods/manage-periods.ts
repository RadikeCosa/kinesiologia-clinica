import { z } from "zod";
import type { PeriodRepository } from "./period.repository";
import type { ReportRepository, ReportTools } from "./report.repository";
import type { PatientRepository } from "../patients/patient.repository";
import type { TreatmentRepository } from "../treatments/treatment.repository";
import type { VisitRepository } from "../visits/visit.repository";
import type { MetricRepository } from "../visits/metric.repository";
import type { ClinicalEvaluationRepository, ClinicalSymptomRepository, PerformedProcedureRepository } from "../visits/clinical-entry.repository";
import type { ConditionRepository } from "../conditions/condition.repository";
import type { ScheduledVisitRepository } from "../schedule/scheduled-visit.repository";
import { PeriodStateError, periodCount, periodVisits, reconcilePeriod, validQuota } from "@/domain/treatment-period/treatment-period";
import type { PeriodReport } from "@/domain/treatment-period/period-report";
import { draftContent, reportSource } from "./report-source";
export interface PeriodDependencies { periods: PeriodRepository; reports: ReportRepository; reportTools: ReportTools; patients: PatientRepository; treatments: TreatmentRepository; visits: VisitRepository; metrics: MetricRepository; evaluations: ClinicalEvaluationRepository; symptoms: ClinicalSymptomRepository; procedures: PerformedProcedureRepository; conditions: ConditionRepository; scheduledVisits: ScheduledVisitRepository; clock?: { now(): Date } }
const id = z.string().regex(/^[A-Za-z0-9.-]{1,64}$/);
const quota = z.coerce.number().int().min(1).max(500);
const reason = z.string().trim().min(5).max(2000);
export async function periodSnapshot(patientId: string, treatmentId: string, periodId: string | undefined, d: PeriodDependencies) {
  id.parse(patientId); id.parse(treatmentId); if (periodId) id.parse(periodId);
  const treatment = await d.treatments.getById(treatmentId);
  if (!treatment || treatment.patientId !== patientId) throw new PeriodStateError("Tratamiento no disponible para este paciente.");
  const period = periodId ? await d.periods.get(periodId) : await d.periods.current(treatment);
  if (!period || period.patientId !== patientId || period.treatmentId !== treatmentId) throw new PeriodStateError("Período no disponible para este paciente.");
  const [patient, visits, diagnoses, evaluations, symptoms] = await Promise.all([d.patients.getById(patientId), d.visits.listByPatientId(patientId), d.conditions.listByIds(treatment.diagnosisReferences?.map(x => x.conditionId) ?? []), d.evaluations.listByPatientId(patientId), d.symptoms.listByPatientId(patientId)]);
  if (!patient) throw new PeriodStateError("Paciente no disponible.");
  const own = periodVisits(period, visits);
  const finished = own.filter(v => v.status === "finished");
  const [metrics, procedures] = await Promise.all([Promise.all(finished.map(v => d.metrics.listByVisitId(v.id))), Promise.all(finished.map(v => d.procedures.listByVisitId(v.id)))]);
  const sourceInput = { patient, treatment, period: reconcilePeriod(period, visits), visits, diagnoses, evaluations, symptoms, metrics: metrics.flat(), procedures: procedures.flat() };
  const fingerprint = reportSource(sourceInput, d.reportTools);
  return { ...sourceInput, ...fingerprint, count: periodCount(period, visits), content: draftContent(sourceInput) };
}
async function persistedSnapshot(patientId: string, treatmentId: string, periodId: string | undefined, d: PeriodDependencies) {
  const treatment = await d.treatments.getById(treatmentId);
  if (!treatment || treatment.patientId !== patientId) throw new PeriodStateError("Tratamiento no disponible.");
  await d.periods.materialize(treatment);
  return periodSnapshot(patientId, treatmentId, periodId, d);
}
const saveSchema = z.object({ operationId: z.uuid(), patientId: id, treatmentId: id, periodId: id.optional(), sourceFingerprint: z.string().regex(/^[a-f0-9]{64}$/), professionalName: z.string().trim().min(1).max(240), registration: z.string().trim().max(120), narrative: z.object({ context: z.string().max(12000), evolution: z.string().max(12000), interventions: z.string().max(12000), nextStep: z.string().max(12000), observations: z.string().max(12000) }), replaces: id.optional(), replacementReason: reason.optional() });
export async function savePeriodReport(raw: unknown, d: PeriodDependencies) {
  const input = saveSchema.parse(raw);
  const existing = await d.reports.byOperation(input.operationId);
  function same(report: PeriodReport) {
    return report.patientId === input.patientId && report.treatmentId === input.treatmentId && (!input.periodId || report.periodId === input.periodId) && report.sourceFingerprint === input.sourceFingerprint && report.replaces === input.replaces && report.replacementReason === input.replacementReason && report.content.professionalName === input.professionalName && report.content.registration === input.registration && d.reportTools.canonical(report.content.narrative) === d.reportTools.canonical(input.narrative);
  }
  if (existing) { if (!same(existing)) throw new PeriodStateError("El reintento contiene datos diferentes."); return existing; }
  const snapshot = await persistedSnapshot(input.patientId, input.treatmentId, input.periodId, d);
  const { period, treatment, count } = snapshot;
  if (snapshot.sourceFingerprint !== input.sourceFingerprint) throw new PeriodStateError("Los registros clínicos cambiaron. Revisá los datos actualizados antes de guardar; tu texto editado se conserva en esta pantalla.");
  if ((!count.completed && !input.replaces) || count.reserved) throw new PeriodStateError("El informe necesita sesiones finalizadas y ninguna visita en curso.");
  let previous: PeriodReport | undefined;
  if (input.replaces) {
    if (!input.replacementReason || period.currentReportId !== input.replaces || !["reported", "closed"].includes(period.phase)) throw new PeriodStateError("Solo se puede reemplazar el informe vigente, indicando un motivo.");
    previous = (await d.reports.get(input.replaces)) ?? undefined;
    if (!previous || previous.status !== "current" || previous.periodId !== period.id) throw new PeriodStateError("El informe vigente cambió. Revisá el historial.");
  } else if (period.phase !== "report-pending" || period.currentReportId) throw new PeriodStateError("El período todavía no requiere un informe o ya tiene uno guardado.");
  const content = { ...snapshot.content, narrative: input.narrative, professionalName: input.professionalName, registration: input.registration };
  const pdf = await d.reportTools.pdf(content);
  const report: PeriodReport = { id: `report-${input.operationId}`, operationId: input.operationId, patientId: input.patientId, treatmentId: treatment.id, periodId: period.id, status: "current", createdAt: (d.clock?.now() ?? new Date()).toISOString(), replaces: previous?.id, replacementReason: input.replacementReason, sourceFingerprint: snapshot.sourceFingerprint, content, sources: snapshot.source, sourceVersions: snapshot.sourceVersions, contentHash: d.reportTools.hash(d.reportTools.canonical(content)), sourceHash: d.reportTools.hash(d.reportTools.canonical(snapshot.source)), pdfHash: d.reportTools.hash(pdf) };
  try { await d.reports.save(report, pdf, { ...period, phase: period.phase === "closed" ? "closed" : "reported" }, treatment, previous); }
  catch (error) { const recovered = await d.reports.byOperation(input.operationId); if (!recovered || !same(recovered)) throw error; return recovered; }
  const saved = await d.reports.byOperation(input.operationId); if (!saved) throw new PeriodStateError("No se pudo verificar el informe guardado. Reintentá sin cerrar la pantalla."); return saved;
}
export async function changePeriod(raw: unknown, d: PeriodDependencies) {
  const input = z.object({ patientId: id, treatmentId: id, periodId: id.optional(), expectedVersion: z.string().min(1), event: z.enum(["partial", "cancel-partial", "quota", "renew", "finish"]), reason: reason.optional(), quota: quota.optional(), frequency: z.string().trim().min(1).max(240).optional(), endDate: z.iso.date().optional(), operationId: z.uuid().optional() }).parse(raw);
  const s = await persistedSnapshot(input.patientId, input.treatmentId, input.periodId, d);
  let p = s.period;
  let t = s.treatment;
  if (p.version !== input.expectedVersion && !(input.expectedVersion === "legacy" && p.ordinal === 1 && p.clinicalRevision === 0)) {
    if (input.event === "renew" && input.operationId && p.phase === "closed") {
      const renewed = await d.periods.get(`tp-${input.operationId}`);
      if (renewed && renewed.treatmentId === t.id && renewed.ordinal === p.ordinal + 1 && renewed.quota === input.quota && renewed.frequency === input.frequency) return renewed;
    }
    throw new PeriodStateError("El período cambió en otro dispositivo. Recargá la pantalla.");
  }
  if (p.phase === "closed") throw new PeriodStateError("Este período ya está cerrado.");
  if (input.event === "partial") {
    if (!input.reason || p.phase !== "open" || !s.count.completed || s.count.reserved) throw new PeriodStateError("El cierre parcial requiere un motivo, sesiones realizadas y ninguna visita en curso.");
    p = { ...p, phase: "report-pending", closure: "partial", partialReason: input.reason };
  } else if (input.event === "cancel-partial") {
    if (p.phase !== "report-pending" || p.closure !== "partial") throw new PeriodStateError("El cierre parcial ya no puede cancelarse.");
    p = reconcilePeriod({ ...p, phase: "open", closure: undefined, partialReason: undefined }, s.visits);
  } else if (input.event === "quota") {
    if (!input.quota || p.phase !== "open" || validQuota(p.quota) && s.count.completed + s.count.reserved >= p.quota || input.quota < s.count.completed + s.count.reserved && validQuota(p.quota)) throw new PeriodStateError("No se puede modificar el cupo completo ni reducirlo debajo de las plazas ocupadas.");
    p = reconcilePeriod({ ...p, quota: input.quota, frequency: input.frequency ?? p.frequency }, s.visits);
    t = { ...t, plannedSessionCount: p.quota, plannedFrequency: p.frequency };
  } else {
    if (s.count.reserved) throw new PeriodStateError("Primero finalizá o anulá la visita en curso.");
    if (s.count.completed || p.currentReportId) {
      const report = p.currentReportId ? await d.reports.get(p.currentReportId) : null;
      if (p.phase !== "reported" || !report || report.status !== "current" || report.sourceFingerprint !== s.sourceFingerprint) throw new PeriodStateError("Guardá un informe actualizado o su reemplazo antes de renovar o finalizar.");
    }
    if (input.event === "renew") {
      if (t.status !== "active" || !s.count.completed || p.closure === "partial" || !input.quota || !input.frequency || !input.operationId) throw new PeriodStateError("Solo puede renovarse un período completo, informado y activo.");
      const next = { id: `tp-${input.operationId}`, patientId: t.patientId, treatmentId: t.id, ordinal: p.ordinal + 1, quota: input.quota, frequency: input.frequency, phase: "open" as const, available: true, clinicalRevision: 0 };
      await d.periods.transition({ ...p, phase: "closed", available: false }, { ...t, currentPeriodId: next.id, plannedSessionCount: next.quota, plannedFrequency: next.frequency }, next, s.patient.version);
      return next;
    }
    const appointments = await d.scheduledVisits.listByPatientId(t.patientId);
    if (appointments.some(a => a.treatmentId === t.id && ["booked", "proposed"].includes(a.status))) throw new PeriodStateError("Primero resolvé las citas abiertas del tratamiento.");
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires", year: "numeric", month: "2-digit", day: "2-digit" }).format(d.clock?.now() ?? new Date());
    if (!input.endDate || input.endDate < t.startDate || input.endDate > today) throw new PeriodStateError("Revisá la fecha de finalización.");
    p = { ...p, phase: "closed", available: false };
    const finishedAt = (d.clock?.now() ?? new Date()).toISOString();
    const history = (t.statusHistory ?? [{ status: t.status, startedAt: t.startDate }]).map(h => ({ ...h }));
    const last = history.at(-1); if (last && !last.endedAt) last.endedAt = finishedAt;
    t = { ...t, status: "finished", endDate: input.endDate, statusHistory: [...history, { status: "finished", startedAt: finishedAt }] };
  }
  await d.periods.transition({ ...p, clinicalRevision: p.clinicalRevision + 1 }, t, undefined, s.patient.version);
  return p;
}
