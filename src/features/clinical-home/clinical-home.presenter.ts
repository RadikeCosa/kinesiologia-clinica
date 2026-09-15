import type {
  ClinicalHomeScenario,
  HomePatientViewModel,
  PresentedToday,
  PresentedTodayItem,
  TodayDisplayState,
  TodayItemViewModel,
  TreatmentStatus,
} from "./clinical-home.types";

const STATE_COPY: Record<TodayDisplayState, { status: string; action: string }> = {
  upcoming: { status: "Próxima", action: "Registrar visita" },
  "past-unresolved": { status: "Horario pasado", action: "Registrar visita" },
  "in-progress": { status: "En curso", action: "Continuar visita" },
  "documentation-pending": { status: "Registro pendiente", action: "Completar registro" },
  "sync-pending": { status: "Pendiente de sincronización", action: "Ver estado" },
  "sync-error": { status: "Error de sincronización", action: "Reintentar" },
  completed: { status: "Finalizada", action: "Ver visita" },
  rescheduled: { status: "Reprogramada", action: "Ver nuevo horario" },
  cancelled: { status: "Cancelada", action: "Ver detalle" },
  "scheduled-no-time": { status: "Sin horario", action: "Registrar visita" },
};

function localTimestamp(date: string, time: string) {
  return new Date(`${date}T${time}:00-03:00`).getTime();
}

export function getTodayDisplayState(item: TodayItemViewModel, referenceNow: string): TodayDisplayState {
  if (item.sourceState === "in-progress") return "in-progress";
  if (item.sourceState === "care-ended") return "documentation-pending";
  if (item.sourceState === "confirmed-local") return item.syncError ? "sync-error" : "sync-pending";
  if (item.sourceState === "completed") return "completed";
  if (item.sourceState === "rescheduled") return "rescheduled";
  if (item.sourceState === "cancelled") return "cancelled";
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

export function presentToday(scenario: ClinicalHomeScenario): PresentedToday {
  const patientById = new Map(scenario.patients.map((patient) => [patient.id, patient]));
  const today = scenario.referenceNow.slice(0, 10);
  const items = scenario.todayItems.flatMap((item) => {
    const patient = patientById.get(item.patientId);
    return patient ? [presentItem(item, patient, scenario.referenceNow)] : [];
  });
  const previousPending = items
    .filter((item) => item.date < today && ["documentation-pending", "sync-pending", "sync-error"].includes(item.displayState))
    .sort((a, b) => b.date.localeCompare(a.date));
  const current = items.filter((item) => item.date === today);
  const changes = current.filter((item) => ["rescheduled", "cancelled"].includes(item.displayState));
  const active = current.filter((item) => !["rescheduled", "cancelled"].includes(item.displayState));
  const timed = active.filter((item) => item.scheduledTime).sort((a, b) => a.scheduledTime!.localeCompare(b.scheduledTime!));
  const withoutTime = active.filter((item) => !item.scheduledTime).sort((a, b) => a.patient.displayName.localeCompare(b.patient.displayName, "es"));
  return {
    previousPending,
    timed,
    withoutTime,
    changes,
    summary: {
      completed: active.filter((item) => item.displayState === "completed").length,
      pending: active.filter((item) => ["past-unresolved", "documentation-pending", "sync-pending", "sync-error"].includes(item.displayState)).length,
      upcoming: active.filter((item) => ["upcoming", "scheduled-no-time"].includes(item.displayState)).length,
    },
  };
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
