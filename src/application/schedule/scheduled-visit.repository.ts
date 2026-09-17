import type { ScheduledVisit } from "@/domain/schedule/scheduled-visit";

export interface ScheduledVisitRepository {
  getById(id: string): Promise<ScheduledVisit | null>;
  listByPatientId(patientId: string): Promise<ScheduledVisit[]>;
  listOpen(): Promise<ScheduledVisit[]>;
  listBetween(from: string, to: string): Promise<ScheduledVisit[]>;
  listChangedBetween(from: string, to: string): Promise<ScheduledVisit[]>;
  putIfAbsent(visit: ScheduledVisit): Promise<ScheduledVisit>;
  replace(original: ScheduledVisit, replacement: ScheduledVisit): Promise<{ original: ScheduledVisit; replacement: ScheduledVisit }>;
  close(visit: ScheduledVisit): Promise<ScheduledVisit>;
}
