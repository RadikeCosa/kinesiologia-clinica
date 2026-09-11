export type ClinicalRecordStatus =
  | "available"
  | "unavailable"
  | "not_configured";

export interface ClinicalRecordHealth {
  status: ClinicalRecordStatus;
  checkedAt: string;
}
