import type {
  ClinicalHomeScenario,
  HomePatientViewModel,
  PresentedDay,
  PresentedTodayItem,
  TodayDisplayState,
  TodayItemViewModel,
  TreatmentStatus,
  WeekDayViewModel,
} from "./clinical-home.types";

const STATE_COPY: Record<TodayDisplayState, { status: string; action: string }> = {
  upcoming: { status: "Próxima", action: "Registrar visita" },
  "past-unresolved": { status: "Pendiente", action: "Resolver visita" },
  "in-progress": { status: "En curso", action: "Continuar visita" },
  "documentation-pending": { status: "Registro pendiente", action: "Completar registro" },
  "sync-pending": { status: "Pendiente de sincronización", action: "Ver estado" },
  "sync-error": { status: "Error de sincronización", action: "Reintentar" },
  completed: { status: "Finalizada", action: "Ver visita" },
  rescheduled: { status: "Reprogramada", action: "Ver nuevo horario" },
  cancelled: { status: "Cancelada", action: "Ver detalle" },
  "no-show": { status: "No se realizó", action: "Ver detalle" },
  "scheduled-no-time": { status: "Sin horario", action: "Registrar visita" },
};

function localTimestamp(date: string, time: string) {
  return new Date(`${date}T${time}:00-03:00`).getTime();
}

const CLOSED_STATES: TodayDisplayState[] = ["completed", "rescheduled", "cancelled", "no-show"];
const CHANGE_STATES: TodayDisplayState[] = ["rescheduled", "cancelled", "no-show"];
const PENDING_STATES: TodayDisplayState[] = ["past-unresolved", "documentation-pending", "sync-pending", "sync-error", "scheduled-no-time"];
const ATTENTION_STATES: TodayDisplayState[] = ["past-unresolved", "documentation-pending", "sync-pending", "sync-error"];

export function getLocalDate(referenceNow: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(referenceNow));
}

export function addLocalDays(date: string, days: number) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function formatFriendlyDate(date: string) {
  const value = new Date(`${date}T12:00:00Z`);
  const formatted = new Intl.DateTimeFormat("es-AR", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(value);
  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
}

export function formatFriendlyDateTime(date: string, time?: string) {
  return `${formatFriendlyDate(date)}${time ? `, ${time} hs` : ", sin horario"}`;
}

export function getTodayDisplayState(item: TodayItemViewModel, referenceNow: string): TodayDisplayState {
  if (item.sourceState === "in-progress") return "in-progress";
  if (item.sourceState === "care-ended") return "documentation-pending";
  if (item.sourceState === "confirmed-local") return item.syncError ? "sync-error" : "sync-pending";
  if (item.sourceState === "completed") return "completed";
  if (item.sourceState === "rescheduled") return "rescheduled";
  if (item.sourceState === "cancelled") return "cancelled";
  if (item.sourceState === "no-show") return "no-show";
  if (!item.scheduledTime) return "scheduled-no-time";
  return localTimestamp(item.date, item.scheduledTime) < new Date(referenceNow).getTime()
    ? "past-unresolved"
    : "upcoming";
}

function presentItem(
  item: TodayItemViewModel,
  patient: HomePatientViewModel,
  referenceNow: string,
): PresentedTodayItem {
  const displayState = getTodayDisplayState(item, referenceNow);
  return {
    ...item,
    patient,
    displayState,
    statusLabel: STATE_COPY[displayState].status,
    primaryActionLabel: STATE_COPY[displayState].action,
  };
}

export function presentToday(scenario: ClinicalHomeScenario): PresentedDay {
  return presentDay({
    referenceNow: scenario.referenceNow,
    selectedDate: getLocalDate(scenario.referenceNow),
    patients: scenario.patients,
    dayItems: scenario.todayItems,
  });
}

export function presentDay(input: {
  referenceNow: string;
  selectedDate: string;
  patients: HomePatientViewModel[];
  dayItems: TodayItemViewModel[];
}): PresentedDay {
  const patientById = new Map(input.patients.map((patient) => [patient.id, patient]));
  const today = getLocalDate(input.referenceNow);
  const items = input.dayItems.flatMap((item) => {
    const patient = patientById.get(item.patientId);
    return patient ? [presentItem(item, patient, input.referenceNow)] : [];
  });
  const activeVisit = items.find((item) => item.displayState === "in-progress");
  const previousPending = input.selectedDate === today
    ? items
      .filter((item) => item.id !== activeVisit?.id && item.date < today && PENDING_STATES.includes(item.displayState))
      .sort((a, b) => b.date.localeCompare(a.date))
    : [];
  const current = items.filter((item) => item.date === input.selectedDate && item.id !== activeVisit?.id);
  const changes = items
    .filter((item) => item.changeDate === input.selectedDate && CHANGE_STATES.includes(item.displayState))
    .sort((a, b) => (b.scheduledTime ?? "").localeCompare(a.scheduledTime ?? ""));
  const completed = current.filter((item) => item.displayState === "completed");
  const active = current.filter((item) => !CLOSED_STATES.includes(item.displayState));
  const timed = active.filter((item) => item.scheduledTime).sort((a, b) => a.scheduledTime!.localeCompare(b.scheduledTime!));
  const withoutTime = active.filter((item) => !item.scheduledTime).sort((a, b) => a.patient.displayName.localeCompare(b.patient.displayName, "es"));
  return {
    selectedDate: input.selectedDate,
    isToday: input.selectedDate === today,
    activeVisit,
    previousPending,
    timed,
    withoutTime,
    completed,
    changes,
    summary: {
      completed: completed.length,
      pending: previousPending.length + active.filter((item) => ATTENTION_STATES.includes(item.displayState)).length,
      upcoming: active.filter((item) => ["upcoming", "scheduled-no-time"].includes(item.displayState)).length,
    },
  };
}

export function presentWeek(referenceNow: string, dayItems: TodayItemViewModel[]): WeekDayViewModel[] {
  const today = getLocalDate(referenceNow);
  return Array.from({ length: 7 }, (_, index) => {
    const date = addLocalDays(today, index);
    const value = new Date(`${date}T12:00:00Z`);
    const visitCount = dayItems.filter((item) => {
      const state = getTodayDisplayState(item, referenceNow);
      if (item.date === date) return !["cancelled", "rescheduled"].includes(state);
      return index === 0 && item.date < today && (PENDING_STATES.includes(state) || state === "in-progress");
    }).length;
    const weekday = new Intl.DateTimeFormat("es-AR", { weekday: "short", timeZone: "UTC" }).format(value).replace(".", "");
    const fullDate = new Intl.DateTimeFormat("es-AR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(value);
    return {
      date,
      weekdayLabel: index === 0 ? "Hoy" : weekday.charAt(0).toUpperCase() + weekday.slice(1),
      dayLabel: new Intl.DateTimeFormat("es-AR", { day: "numeric", timeZone: "UTC" }).format(value),
      fullLabel: `${index === 0 ? "Hoy, " : ""}${fullDate}, ${visitCount} ${visitCount === 1 ? "visita" : "visitas"}`,
      visitCount,
      isToday: index === 0,
    };
  });
}

function searchable(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es");
}

export function filterDirectory(
  patients: HomePatientViewModel[],
  query: string,
  status: TreatmentStatus | "all",
) {
  const needle = searchable(query.trim());
  return patients.filter((patient) => {
    if (status !== "all" && patient.treatment.status !== status) return false;
    if (!needle) return true;
    return searchable([patient.displayName, patient.phone, patient.address].filter(Boolean).join(" ")).includes(needle);
  });
}
