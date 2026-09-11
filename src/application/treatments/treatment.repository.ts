import type { Treatment } from "@/domain/treatment/treatment";

export interface TreatmentRepository {
  listActive(): Promise<Treatment[]>;
}
