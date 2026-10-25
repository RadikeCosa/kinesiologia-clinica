import type { PeriodReport } from "@/domain/treatment-period/period-report";
import type { TreatmentPeriod } from "@/domain/treatment-period/treatment-period";
import type { Treatment } from "@/domain/treatment/treatment";
export interface ReportRepository {
  readArchive(id: string): Promise<{ report: PeriodReport; pdf: Uint8Array } | null>;
  get(id: string): Promise<PeriodReport | null>;
  byOperation(operationId: string): Promise<PeriodReport | null>;
  list(patientId: string): Promise<PeriodReport[]>;
  pdf(id: string): Promise<Uint8Array>;
  save(report: PeriodReport, pdf: Uint8Array, period: TreatmentPeriod, treatment: Treatment, previous?: PeriodReport): Promise<void>;
}
export interface ReportTools {
  canonical(value: unknown): string;
  hash(value: string | Uint8Array): string;
  pdf(content: PeriodReport["content"]): Promise<Uint8Array>;
  operationId(): string;
}
