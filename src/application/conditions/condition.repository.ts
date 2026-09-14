import type { Diagnosis } from "@/domain/condition/condition";

export interface ConditionRepository {
  listByIds(ids: string[]): Promise<Diagnosis[]>;
}
