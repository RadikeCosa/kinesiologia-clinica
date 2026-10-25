import { z } from "zod";
import { buenosAiresDate, reconcileRoute, type DailyRoute } from "@/domain/route/daily-route";
import { DailyRouteConflictError, type DailyRouteRepository } from "./daily-route.repository";
import { getClinicalHome } from "../home/get-clinical-home";
import type { ClinicalHomeData } from "@/application/home/clinical-home.types";

type Dependencies = Parameters<typeof getClinicalHome>[1] & { dailyRoutes: DailyRouteRepository };

export function routeCandidates(data: ClinicalHomeData): string[] {
  const patientIds = new Set(data.patients.map(p => p.id));
  const date = buenosAiresDate(new Date(data.referenceNow));
  const scheduledIds = new Set(data.todayItems.filter(i => i.date === date && i.sourceState === "scheduled" && patientIds.has(i.patientId)).map(i => i.id));
  return data.agendaItems.filter(i => scheduledIds.has(i.id) && ["booked", "proposed"].includes(i.status))
    .sort((a, b) => (a.scheduledTime ?? "99:99").localeCompare(b.scheduledTime ?? "99:99") || a.patientName.localeCompare(b.patientName, "es") || a.id.localeCompare(b.id)).map(i => i.id);
}

export async function readDailyRoute(now: Date, dependencies: Dependencies): Promise<DailyRoute> {
  const data = await getClinicalHome(now, dependencies);
  if (data.dailyRouteUnavailable) throw new Error("No se pudo verificar el recorrido guardado. Volvé a intentar.");
  const date = buenosAiresDate(now);
  return { date, version: data.dailyRoute?.version, appointmentIds: reconcileRoute(data.dailyRoute?.appointmentIds ?? [], routeCandidates(data)) };
}

const inputSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  appointmentIds: z.array(z.string().regex(/^[A-Za-z0-9.-]{1,64}$/)).max(1000),
  version: z.string().regex(/^[A-Za-z0-9.-]{1,64}$/).optional(),
});

export async function saveDailyRoute(input: unknown, now: Date, dependencies: Dependencies): Promise<DailyRoute> {
  const proposed = inputSchema.parse(input);
  if (proposed.date !== buenosAiresDate(now)) throw new Error("Solo podés ordenar el recorrido de hoy. Actualizá la pantalla.");
  if (new Set(proposed.appointmentIds).size !== proposed.appointmentIds.length) throw new Error("El recorrido contiene visitas repetidas.");
  const current = await readDailyRoute(now, dependencies);
  // Membership changes also require a fresh view, never silently lose a new visit.
  if (current.version !== proposed.version || current.appointmentIds.length !== proposed.appointmentIds.length || proposed.appointmentIds.some(id => !current.appointmentIds.includes(id))) throw new DailyRouteConflictError();
  return dependencies.dailyRoutes.save(proposed);
}
