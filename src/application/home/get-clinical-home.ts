import type { PatientRepository } from "@/application/patients/patient.repository";
import type { ScheduledVisitRepository } from "@/application/schedule/scheduled-visit.repository";
import type { TreatmentRepository } from "@/application/treatments/treatment.repository";
import type { VisitRepository } from "@/application/visits/visit.repository";
import { getPatientDisplayName } from "@/domain/patient/patient";
import type { ScheduledVisit } from "@/domain/schedule/scheduled-visit";
import { deriveDocumentationTimeliness, deriveStartPunctuality } from "@/domain/visit/visit-timeliness";
import type { AgendaItemViewModel, ClinicalHomeData, HomePatientViewModel, TodayItemViewModel } from "@/features/clinical-home/clinical-home.types";

type Dependencies = { patients: PatientRepository; treatments: TreatmentRepository; scheduledVisits: ScheduledVisitRepository; visits: VisitRepository };

function localDate(value: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires", year: "numeric", month: "2-digit", day: "2-digit" }).format(value);
}
function localTime(value?: string) {
  return value ? new Intl.DateTimeFormat("es-AR", { timeZone: "America/Argentina/Buenos_Aires", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(value)) : undefined;
}
function addDays(date: string, days: number) {
  const value = new Date(`${date}T12:00:00Z`); value.setUTCDate(value.getUTCDate() + days); return value.toISOString().slice(0, 10);
}
function monthEnd(month: string) {
  const [year, value] = month.split("-").map(Number);
  return `${month}-${String(new Date(Date.UTC(year, value, 0)).getUTCDate()).padStart(2, "0")}`;
}
function appointmentStatus(item: ScheduledVisit): AgendaItemViewModel["status"] { return item.replacedById ? "rescheduled" : item.status; }
const STATUS_LABEL: Record<AgendaItemViewModel["status"], string> = {
  proposed: "Sin horario", booked: "Confirmada", fulfilled: "Atendida", cancelled: "Cancelada", "no-show": "No se realizó", rescheduled: "Reprogramada",
};

export async function getClinicalHome(referenceNow: Date, dependencies: Dependencies, requestedMonth?: string): Promise<ClinicalHomeData> {
  const today = localDate(referenceNow);
  const agendaMonth = requestedMonth && /^\d{4}-(0[1-9]|1[0-2])$/.test(requestedMonth) ? requestedMonth : today.slice(0, 7);
  const agendaFrom = `${agendaMonth}-01`;
  const agendaTo = monthEnd(agendaMonth);
  const weekTo = addDays(today, 6);
  const changeWindowFrom = `${today}T00:00:00-03:00`;
  const changeWindowTo = `${addDays(today, 1)}T00:00:00-03:00`;
  const treatments = await dependencies.treatments.listDirectory();
  const patients = await dependencies.patients.listByIds([...new Set(treatments.map((item) => item.patientId))]);
  const visitsByPatient = await Promise.all(patients.map(async (patient) => [patient.id, await dependencies.visits.listByPatientId(patient.id)] as const));
  const visits = visitsByPatient.flatMap(([, items]) => items).filter((visit) => visit.status !== "entered-in-error");
  const [openAppointments, weekAppointments, rangeAppointments, changedAppointments] = await Promise.all([
    dependencies.scheduledVisits.listOpen(), dependencies.scheduledVisits.listBetween(today, weekTo), dependencies.scheduledVisits.listBetween(agendaFrom, agendaTo),
    dependencies.scheduledVisits.listChangedBetween(changeWindowFrom, changeWindowTo),
  ]);
  const appointments = [...new Map([...openAppointments, ...weekAppointments, ...rangeAppointments, ...changedAppointments].map((item) => [item.id, item])).values()];
  const patientMap = new Map(patients.map((item) => [item.id, item]));
  const visitByAppointment = new Map(visits.filter((item) => item.appointmentId).map((item) => [item.appointmentId!, item]));
  const latestTreatmentByPatient = new Map<string, typeof treatments[number]>();
  for (const treatment of treatments) {
    const existing = latestTreatmentByPatient.get(treatment.patientId);
    if (!existing || treatment.startDate > existing.startDate) latestTreatmentByPatient.set(treatment.patientId, treatment);
  }
  const homePatients: HomePatientViewModel[] = patients.flatMap((patient) => {
    const treatment = latestTreatmentByPatient.get(patient.id); if (!treatment) return [];
    const treatmentVisits = visits.filter((visit) => visit.treatmentId === treatment.id && visit.status === "finished").sort((a, b) => b.startedAt.localeCompare(a.startedAt));
    const next = appointments.filter((item) => item.patientId === patient.id && ["proposed", "booked"].includes(item.status)).sort((a, b) => (a.startsAt ?? a.scheduledDate).localeCompare(b.startsAt ?? b.scheduledDate))[0];
    return [{
      id: patient.id, displayName: getPatientDisplayName(patient), phone: patient.phone, address: patient.address,
      accessInstructions: patient.accessInstructions, precautions: treatment.precautions,
      lastVisitLabel: treatmentVisits[0]?.startedAt, latestPlan: treatmentVisits[0]?.clinicalNote?.nextPlan,
      treatment: { id: treatment.id, status: treatment.status, completedSessions: treatmentVisits.length, totalSessions: treatment.plannedSessionCount, frequency: treatment.plannedFrequency, nextVisit: next ? { date: next.scheduledDate, time: localTime(next.startsAt) } : undefined },
    }];
  }).sort((a, b) => a.displayName.localeCompare(b.displayName, "es"));

  const toToday = (appointment: ScheduledVisit): TodayItemViewModel => {
    const visit = visitByAppointment.get(appointment.id);
    const sourceState = appointment.replacedById ? "rescheduled" : appointment.status === "no-show" ? "no-show" : appointment.status === "cancelled" ? "cancelled" : visit?.status === "in-progress" ? "in-progress" : visit?.status === "finished" ? "completed" : appointment.status === "fulfilled" ? "care-ended" : "scheduled";
    const changed = ["rescheduled", "cancelled", "no-show"].includes(sourceState);
    return { id: appointment.id, patientId: appointment.patientId, treatmentId: appointment.treatmentId, appointmentVersion: appointment.version, visitId: visit?.id, visitVersion: visit?.version, date: appointment.scheduledDate, changeDate: changed && appointment.updatedAt ? localDate(new Date(appointment.updatedAt)) : undefined, scheduledTime: localTime(appointment.startsAt), sourceState, actualStart: localTime(visit?.startedAt), actualEnd: localTime(visit?.endedAt), startPunctuality: visit ? deriveStartPunctuality(visit, appointment) : undefined, documentationTimeliness: visit ? deriveDocumentationTimeliness(visit) : undefined };
  };
  const unplanned = visits.filter((visit) => {
    if (visit.appointmentId) return false;
    const date = localDate(new Date(visit.startedAt));
    return date >= today && date <= weekTo;
  }).map<TodayItemViewModel>((visit) => {
    const date = localDate(new Date(visit.startedAt));
    return { id: visit.id, patientId: visit.patientId, treatmentId: visit.treatmentId, visitId: visit.id, visitVersion: visit.version, date, scheduledTime: localTime(visit.startedAt), sourceState: visit.status === "in-progress" ? "in-progress" : "completed", actualStart: localTime(visit.startedAt), actualEnd: localTime(visit.endedAt), documentationTimeliness: deriveDocumentationTimeliness(visit) };
  });
  const scheduledDayItems = appointments.filter((item) => item.scheduledDate <= weekTo).map(toToday);
  const changedDayItems = changedAppointments.map(toToday).filter((item) => item.changeDate === today);
  const dayItems = [...new Map([...scheduledDayItems, ...changedDayItems, ...unplanned].map((item) => [item.id, item])).values()];
  const todayItems = dayItems.filter((item) => item.date <= today);
  const agendaItems = appointments.filter((item) =>
    (item.scheduledDate < today && ["proposed", "booked"].includes(item.status)) ||
    (item.scheduledDate >= agendaFrom && item.scheduledDate <= agendaTo),
  ).map<AgendaItemViewModel>((item) => {
    const status = appointmentStatus(item); return { id: item.id, patientId: item.patientId, patientName: getPatientDisplayName(patientMap.get(item.patientId) ?? { id: item.patientId, givenName: "Paciente", familyName: "" }), treatmentId: item.treatmentId, scheduledDate: item.scheduledDate, scheduledTime: localTime(item.startsAt), durationMinutes: item.durationMinutes, status, statusLabel: STATUS_LABEL[status], version: item.version };
  }).sort((a, b) => `${a.scheduledDate}${a.scheduledTime ?? "99:99"}`.localeCompare(`${b.scheduledDate}${b.scheduledTime ?? "99:99"}`));
  return { referenceNow: referenceNow.toISOString(), agendaMonth, agendaFrom, agendaTo, patients: homePatients, todayItems, dayItems, agendaItems };
}
