/** Operational order only: never changes an appointment's agreed time. */
export interface DailyRoute {
  date: string;
  appointmentIds: string[];
  version?: string;
}

export function reconcileRoute(saved: readonly string[], available: readonly string[]): string[] {
  const allowed = new Set(available);
  return [...new Set([...saved.filter(id => allowed.has(id)), ...available])];
}

export function buenosAiresDate(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}
