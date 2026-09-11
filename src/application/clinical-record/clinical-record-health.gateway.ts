import type { ClinicalRecordStatus } from "@/domain/system/clinical-record-status";

export interface ClinicalRecordHealthGateway {
  checkAvailability(): Promise<ClinicalRecordStatus>;
}
