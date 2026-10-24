import type { DailyRoute } from "@/domain/route/daily-route";

export class DailyRouteConflictError extends Error {
  constructor() { super("El recorrido cambió en otro dispositivo. Se cargó el orden vigente."); }
}

export interface DailyRouteRepository {
  get(date: string): Promise<DailyRoute | null>;
  save(route: DailyRoute): Promise<DailyRoute>;
}
