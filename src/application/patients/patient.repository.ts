import type { Patient } from "@/domain/patient/patient";

export interface PatientRepository {
  listAll?(): Promise<Patient[]>;
  listByIds(ids: string[]): Promise<Patient[]>;
  getById(id: string): Promise<Patient | null>;
}
