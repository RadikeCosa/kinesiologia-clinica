import type { ScheduledVisit } from "@/domain/schedule/scheduled-visit";
import type { AgendaLease } from "./agenda-coordinator.repository";

export interface ScheduledVisitRepository {
  getById(id: string): Promise<ScheduledVisit | null>;
  listByPatientId(patientId: string): Promise<ScheduledVisit[]>;
  listOpen(): Promise<ScheduledVisit[]>;
  listBetween(from: string, to: string): Promise<ScheduledVisit[]>;
  listChangedBetween(from: string, to: string): Promise<ScheduledVisit[]>;
  putIfAbsent(visit: ScheduledVisit, lease?: AgendaLease): Promise<ScheduledVisit>;
  replace(original: ScheduledVisit, replacement: ScheduledVisit, lease?: AgendaLease): Promise<{ original: ScheduledVisit; replacement: ScheduledVisit }>;
  close(visit: ScheduledVisit, lease?: AgendaLease): Promise<ScheduledVisit>;
}
