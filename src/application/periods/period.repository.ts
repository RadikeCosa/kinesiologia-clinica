import type { Treatment } from "@/domain/treatment/treatment";
import type { TreatmentPeriod } from "@/domain/treatment-period/treatment-period";

export interface PeriodRepository {
  firstId(treatmentId: string): string;
  get(id: string): Promise<TreatmentPeriod | null>;
  current(treatment: Treatment): Promise<TreatmentPeriod>;
  list(treatment: Treatment): Promise<TreatmentPeriod[]>;
  materialize(treatment: Treatment): Promise<TreatmentPeriod>;
  transition(period: TreatmentPeriod, treatment: Treatment, nextPeriod?: TreatmentPeriod, expectedPatientVersion?: string): Promise<void>;
}
