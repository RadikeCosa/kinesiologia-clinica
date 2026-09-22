import type { Patient } from "@/domain/patient/patient";
import type { Diagnosis } from "@/domain/condition/condition";
import type { Treatment } from "@/domain/treatment/treatment";

export interface ClinicalAdministrationRepository {
  putPatient(patient: Patient, expectedVersion?: string): Promise<void>;
  startTreatment(treatment: Treatment, diagnoses: Diagnosis[]): Promise<void>;
  putTreatment(treatment: Treatment, diagnoses: Diagnosis[], expectedVersion?: string): Promise<void>;
}
