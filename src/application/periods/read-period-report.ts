import type { ReportRepository } from "./report.repository";
import type { PatientRepository } from "../patients/patient.repository";
import type { TreatmentRepository } from "../treatments/treatment.repository";
import type { PeriodRepository } from "./period.repository";
export async function readPeriodReport(id: string, d: { reports: Pick<ReportRepository, "readArchive">; patients: Pick<PatientRepository, "getById">; treatments: Pick<TreatmentRepository, "getById">; periods: Pick<PeriodRepository, "get"> }) {
  if (!/^[A-Za-z0-9.-]{1,64}$/.test(id)) return null;
  const archive = await d.reports.readArchive(id);
  if (!archive) return null;
  const r = archive.report;
  const [patient, treatment, period] = await Promise.all([d.patients.getById(r.patientId), d.treatments.getById(r.treatmentId), d.periods.get(r.periodId)]);
  if (!patient || !treatment || !period || patient.id !== r.patientId || treatment.id !== r.treatmentId || period.id !== r.periodId || treatment.patientId !== patient.id || period.patientId !== patient.id || period.treatmentId !== treatment.id) return null;
  return archive;
}
