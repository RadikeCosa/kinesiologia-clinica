import type { Patient } from "@/domain/patient/patient";

export interface PatientRepository {
  listByIds(ids: string[]): Promise<Patient[]>;
}
