import type { ConsultationRepository } from "./consultation.repository";
import type { PatientRepository } from "@/application/patients/patient.repository";
import { getPatientDisplayName } from "@/domain/patient/patient";
import type { OpenConsultationViewModel } from "@/features/clinical-home/clinical-home.types";

export type OpenConsultationDependencies = {
  consultations: Pick<ConsultationRepository, "listActive"> & Partial<Pick<ConsultationRepository, "getEvaluationAppointment">>;
  patients: Pick<PatientRepository, "getById">;
};

const STATUS: Record<string, string> = { open: "Abierta", coordinating: "En coordinación", "evaluation-completed": "Evaluación realizada" };

export async function getOpenConsultations(referenceNow: Date, dependencies: OpenConsultationDependencies): Promise<OpenConsultationViewModel[]> {
  const consultations = await dependencies.consultations.listActive();
  const patientIds = [...new Set(consultations.map(item => item.patientId))];
  const patients = new Map(await Promise.all(patientIds.map(async id => [id, await dependencies.patients.getById(id)] as const)));
  const result = await Promise.all(consultations.map(async item => {
    const appointments = await Promise.all(item.appointmentIds.map(id => {
      if (!dependencies.consultations.getEvaluationAppointment) throw new Error("No se pudo verificar la coordinación de las consultas.");
      return dependencies.consultations.getEvaluationAppointment(id);
    }));
    const next = appointments.filter(appointment => appointment && ["proposed", "confirmed"].includes(appointment.status))
      .sort((a, b) => (a!.startsAt ?? a!.scheduledDate).localeCompare(b!.startsAt ?? b!.scheduledDate))[0];
    const patient = patients.get(item.patientId);
    return {
      id: item.id,
      patientName: patient ? getPatientDisplayName(patient) : "Paciente",
      statusLabel: STATUS[item.status] ?? "Abierta",
      followUps: item.followUps.filter(f => f.status === "pending").sort((a, b) => a.dueAt.localeCompare(b.dueAt))
        .map(f => ({ id: f.id, dueAt: f.dueAt, overdue: new Date(f.dueAt) < referenceNow })),
      ...(next ? { nextEvaluation: {
        date: next.scheduledDate,
        ...(next.startsAt ? { time: new Intl.DateTimeFormat("es-AR", { timeZone: "America/Argentina/Buenos_Aires", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(next.startsAt)) } : {}),
      } } : {}),
    };
  }));
  return result.sort((a, b) => (a.followUps[0]?.dueAt ?? "9999").localeCompare(b.followUps[0]?.dueAt ?? "9999") || a.patientName.localeCompare(b.patientName, "es"));
}
