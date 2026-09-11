import "server-only";

import { isLocalClinicalSurfaceEnabled } from "@/domain/system/clinical-surface-policy";

export function canRenderLocalClinicalSurface(): boolean {
  return isLocalClinicalSurfaceEnabled(process.env);
}
