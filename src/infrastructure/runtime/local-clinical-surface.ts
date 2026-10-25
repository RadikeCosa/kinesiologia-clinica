import "server-only";

import { isLocalClinicalSurfaceEnabled } from "@/infrastructure/runtime/clinical-surface-policy";

export function canRenderLocalClinicalSurface(): boolean {
  return isLocalClinicalSurfaceEnabled(process.env);
}
