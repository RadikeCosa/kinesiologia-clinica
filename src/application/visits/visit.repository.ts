import type { Visit } from "@/domain/visit/visit";

export interface VisitRepository {
  getById(id: string): Promise<Visit | null>;
  listByPatientId(patientId: string): Promise<Visit[]>;
  listInProgress(): Promise<Visit[]>;
  put(visit: Visit): Promise<void>;
}
