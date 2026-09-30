import type { PeriodRepository } from "./period.repository";
import type { TreatmentRepository } from "../treatments/treatment.repository";
import type { VisitRepository } from "../visits/visit.repository";
import type { Visit } from "@/domain/visit/visit";
import { admitVisit, periodVisits, reconcilePeriod, PeriodStateError } from "@/domain/treatment-period/treatment-period";

/** Read the period BEFORE its visits. Every writer touches this version in its transaction. */
export async function prepareVisitPeriod(visit: Visit, operation: "admit" | "change", ports: { periods: PeriodRepository; treatments: TreatmentRepository; visits: VisitRepository }) {
  const treatment = await ports.treatments.getById(visit.treatmentId);
  if (!treatment || treatment.patientId !== visit.patientId) throw new PeriodStateError("Tratamiento no disponible.");
  const current = await ports.periods.materialize(treatment);
  const periodId = visit.periodId ?? (operation === "admit" ? current.id : ports.periods.firstId(treatment.id));
  const period = periodId === current.id ? current : await ports.periods.get(periodId);
  if (!period || period.treatmentId !== treatment.id) throw new PeriodStateError("Período no disponible.");
  const visits = await ports.visits.listByPatientId(visit.patientId);
  const previous = visits.find(v => v.id === visit.id);
  if (previous?.periodId && previous.periodId !== period.id) throw new PeriodStateError("No se puede cambiar la pertenencia de una visita.");
  if (operation === "admit") {
    if (treatment.status !== "active" || period.id !== current.id) throw new PeriodStateError("No se puede registrar en ese período.");
    admitVisit(period, visits);
  }
  const own = periodVisits(period, visits).filter(v => v.id !== visit.id);
  const nextVisit = { ...visit, periodId: period.id };
  const next = reconcilePeriod({ ...period, clinicalRevision: period.clinicalRevision + 1 }, [...own, nextVisit]);
  return { visit: nextVisit, period: next };
}
