"use server";

import { requireClinicalSession } from "@/infrastructure/auth/auth-http";
import { canRenderLocalClinicalSurface } from "@/infrastructure/runtime/local-clinical-surface";
import { createClinicalDependencies } from "@/infrastructure/fhir/create-clinical-dependencies";
import { readDailyRoute, saveDailyRoute } from "@/application/route/manage-daily-route";
import { DailyRouteConflictError } from "@/application/route/daily-route.repository";
import type { DailyRoute } from "@/domain/route/daily-route";

export interface RouteActionResult { route?: DailyRoute; error?: string; conflict?: boolean }

async function authorize() {
  if (!canRenderLocalClinicalSurface()) throw new Error("El recorrido no está habilitado en este entorno.");
  await requireClinicalSession();
  return createClinicalDependencies();
}

export async function refreshDailyRoute(): Promise<RouteActionResult> {
  const dependencies = await authorize();
  try { return { route: await readDailyRoute(new Date(), dependencies) }; }
  catch { return { error: "No se pudo actualizar el recorrido. Volvé a intentar." }; }
}

export async function updateDailyRoute(input: DailyRoute): Promise<RouteActionResult> {
  const dependencies = await authorize();
  try { return { route: await saveDailyRoute(input, new Date(), dependencies) }; }
  catch (error) {
    if (error instanceof DailyRouteConflictError) {
      try { return { route: await readDailyRoute(new Date(), dependencies), conflict: true, error: error.message }; }
      catch { return { conflict: true, error: "El recorrido cambió y no se pudo actualizar. Volvé a intentar antes de ordenar." }; }
    }
    return { error: "No se pudo guardar el recorrido. Se restauró el último orden confirmado. Volvé a intentar." };
  }
}
