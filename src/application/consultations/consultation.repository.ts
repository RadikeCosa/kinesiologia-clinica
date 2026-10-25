import type { Consultation } from "@/domain/consultation/consultation";
import type { Patient } from "@/domain/patient/patient";
import type { EvaluationAppointment } from "@/domain/consultation/consultation-appointment";
import type { InitialEvaluation } from "@/domain/consultation/initial-evaluation";
import type { Treatment } from "@/domain/treatment/treatment";
import type { Diagnosis } from "@/domain/condition/condition";
import type { AgendaLease } from "@/application/schedule/agenda-coordinator.repository";

export interface ConsultationRepository {
  create(input: { consultation: Consultation; patient: Patient }): Promise<Consultation>;
  getById(id: string): Promise<Consultation | null>;
  save(consultation: Consultation, expectedVersion: string): Promise<Consultation>;
  saveWithEvaluationAppointments(input: { consultation: Consultation; appointments: EvaluationAppointment[]; expectedVersion: string; agendaLease?: AgendaLease }): Promise<Consultation>;
  getEvaluationAppointment(id: string): Promise<EvaluationAppointment | null>;
  completeInitialEvaluation(input: { consultation: Consultation; appointment?: EvaluationAppointment; evaluation: InitialEvaluation; expectedVersion: string }): Promise<Consultation>;
  getInitialEvaluation(id: string): Promise<InitialEvaluation | null>;
  startTreatmentFromConsultation(input: { consultation: Consultation; treatment: Treatment; diagnoses: Diagnosis[]; expectedPatientVersion: string; expectedVersion: string }): Promise<Consultation>;
  listActive(): Promise<Consultation[]>;
  listByPatientId(patientId: string): Promise<Consultation[]>;
  listOpenEvaluationAppointments?(): Promise<EvaluationAppointment[]>;
}
