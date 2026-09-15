import { isLocalClinicalSurfaceEnabled } from "@/domain/system/clinical-surface-policy";

export function isClinicalHomeLabEnabled(
  environment: Readonly<Record<string, string | undefined>>,
): boolean {
  return environment.NODE_ENV === "development" && isLocalClinicalSurfaceEnabled(environment);
}
