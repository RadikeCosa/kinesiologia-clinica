import type { ClinicalRecordHealth } from "@/domain/system/clinical-record-status";
import type { ClinicalRecordHealthGateway } from "./clinical-record-health.gateway";

export async function checkClinicalRecord(
  gateway: ClinicalRecordHealthGateway,
  now: () => Date = () => new Date(),
): Promise<ClinicalRecordHealth> {
  const status = await gateway.checkAvailability();

  return {
    status,
    checkedAt: now().toISOString(),
  };
}
