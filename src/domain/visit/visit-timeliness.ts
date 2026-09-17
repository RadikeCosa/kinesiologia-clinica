import type { ScheduledVisit } from "@/domain/schedule/scheduled-visit";
import type { Visit } from "./visit";

export type StartPunctuality = "on-time" | "delayed" | "severely-delayed";
export type DocumentationTimeliness = "at-the-time" | "same-day" | "later";

function localDate(value: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date(value));
}

export function deriveStartPunctuality(visit: Visit, appointment?: ScheduledVisit | null): StartPunctuality | undefined {
  if (!appointment?.startsAt) return visit.legacyStartPunctuality;
  const delay = (new Date(visit.startedAt).getTime() - new Date(appointment.startsAt).getTime()) / 60_000;
  if (!Number.isFinite(delay)) return visit.legacyStartPunctuality;
  if (delay <= 15) return "on-time";
  if (delay <= 60) return "delayed";
  return "severely-delayed";
}

export function deriveDocumentationTimeliness(visit: Visit): DocumentationTimeliness | undefined {
  if (!visit.endedAt || !visit.recordedAt) return undefined;
  const delay = (new Date(visit.recordedAt).getTime() - new Date(visit.endedAt).getTime()) / 60_000;
  if (!Number.isFinite(delay)) return undefined;
  if (delay <= 60) return "at-the-time";
  return localDate(visit.endedAt) === localDate(visit.recordedAt) ? "same-day" : "later";
}
