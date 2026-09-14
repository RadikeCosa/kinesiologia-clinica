import type { Treatment } from "@/domain/treatment/treatment";

export interface TreatmentRepository {
  listActive(): Promise<Treatment[]>;
  getById(id: string): Promise<Treatment | null>;
}
