export type TreatmentStatus = "active" | "paused" | "finished";
export type TodaySourceState =
  | "scheduled"
  | "in-progress"
  | "care-ended"
  | "confirmed-local"
  | "completed"
  | "rescheduled"
  | "cancelled"
  | "no-show";

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
  | "no-show"
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
    id?: string;
    status: TreatmentStatus;
    completedSessions: number;
    totalSessions?: number;
    frequency?: string;
    nextVisit?: {
      date: string;
      time?: string;
    };
  };
}

export interface TodayItemViewModel {
  id: string;
  patientId: string;
  date: string;
  changeDate?: string;
  scheduledTime?: string;
  sourceState: TodaySourceState;
  actualStart?: string;
  actualEnd?: string;
  rescheduledLabel?: string;
  cancellationReason?: string;
  syncError?: boolean;
  treatmentId?: string;
  appointmentVersion?: string;
  visitId?: string;
  visitVersion?: string;
  startPunctuality?: "on-time" | "delayed" | "severely-delayed";
  documentationTimeliness?: "at-the-time" | "same-day" | "later";
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
  completed: PresentedTodayItem[];
  changes: PresentedTodayItem[];
  summary: { completed: number; pending: number; upcoming: number };
}

export interface PresentedDay extends PresentedToday {
  selectedDate: string;
  isToday: boolean;
  activeVisit?: PresentedTodayItem;
}

export interface WeekDayViewModel {
  date: string;
  weekdayLabel: string;
  dayLabel: string;
  fullLabel: string;
  visitCount: number;
  isToday: boolean;
}

export interface AgendaItemViewModel {
  id: string;
  patientId: string;
  patientName: string;
  treatmentId: string;
  scheduledDate: string;
  scheduledTime?: string;
  durationMinutes?: number;
  status: "proposed" | "booked" | "fulfilled" | "cancelled" | "no-show" | "rescheduled";
  statusLabel: string;
  version?: string;
}

export interface ClinicalHomeData {
  referenceNow: string;
  agendaMonth: string;
  agendaFrom: string;
  agendaTo: string;
  patients: HomePatientViewModel[];
  todayItems: TodayItemViewModel[];
  dayItems: TodayItemViewModel[];
  agendaItems: AgendaItemViewModel[];
}
