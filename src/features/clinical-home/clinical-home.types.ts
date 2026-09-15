export type TreatmentStatus = "active" | "paused" | "finished";
export type TodaySourceState =
  | "scheduled"
  | "in-progress"
  | "care-ended"
  | "confirmed-local"
  | "completed"
  | "rescheduled"
  | "cancelled";

export type TodayDisplayState =
  | "upcoming"
  | "past-unresolved"
  | "in-progress"
  | "documentation-pending"
  | "sync-pending"
  | "sync-error"
  | "completed"
  | "rescheduled"
  | "cancelled"
  | "scheduled-no-time";

export interface HomePatientViewModel {
  id: string;
  displayName: string;
  phone?: string;
  address?: string;
  accessInstructions?: string;
  precautions?: string[];
  lastVisitLabel?: string;
  latestPlan?: string;
  treatment: {
    status: TreatmentStatus;
    completedSessions: number;
    totalSessions?: number;
    frequency?: string;
    nextVisitLabel?: string;
  };
}

export interface TodayItemViewModel {
  id: string;
  patientId: string;
  date: string;
  scheduledTime?: string;
  sourceState: TodaySourceState;
  actualStart?: string;
  actualEnd?: string;
  rescheduledLabel?: string;
  cancellationReason?: string;
  syncError?: boolean;
}

export interface ClinicalHomeScenario {
  id: string;
  title: string;
  description: string;
  referenceNow: string;
  patients: HomePatientViewModel[];
  todayItems: TodayItemViewModel[];
}

export interface PresentedTodayItem extends TodayItemViewModel {
  patient: HomePatientViewModel;
  displayState: TodayDisplayState;
  statusLabel: string;
  primaryActionLabel: string;
}

export interface PresentedToday {
  previousPending: PresentedTodayItem[];
  timed: PresentedTodayItem[];
  withoutTime: PresentedTodayItem[];
  changes: PresentedTodayItem[];
  summary: { completed: number; pending: number; upcoming: number };
}
