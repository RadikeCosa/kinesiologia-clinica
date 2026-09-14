import type { FunctionalMetric } from "@/domain/visit/visit";

export interface MetricRepository {
  listByVisitId(visitId: string): Promise<FunctionalMetric[]>;
  putIfAbsent(metric: FunctionalMetric): Promise<void>;
}
