import type { ClinicalHomeScenario, HomePatientViewModel, TodayItemViewModel } from "./clinical-home.types";

export const LAB_REFERENCE_NOW = "2026-09-15T10:30:00-03:00";

const patients: HomePatientViewModel[] = [
  { id: "elena", displayName: "Elena Ficticia", phone: "+54 299 000 0101", address: "Calle Demostración 101, Neuquén", treatment: { status: "active", completedSessions: 4, totalSessions: 10, frequency: "2 veces por semana", nextVisit: { date: "2026-09-15", time: "08:00" } } },
  { id: "martin", displayName: "Martín Ejemplo", phone: "+54 299 000 0102", address: "Calle Ficticia 456, Neuquén", treatment: { status: "active", completedSessions: 6, totalSessions: 10, frequency: "2 veces por semana", nextVisit: { date: "2026-09-15", time: "09:30" } } },
  { id: "rosa", displayName: "Rosa Demostración", phone: "+54 299 000 0103", address: "Avenida de Prueba 123, Neuquén", accessInstructions: "El timbre no funciona. Avisar por teléfono al llegar.", precautions: ["Riesgo de caída", "Utiliza andador"], lastVisitLabel: "12 de septiembre", latestPlan: "Continuar entrenamiento de marcha dentro del domicilio y reforzar transferencia sentado-de-pie.", treatment: { status: "active", completedSessions: 7, totalSessions: 10, frequency: "Martes y viernes", nextVisit: { date: "2026-09-15", time: "11:00" } } },
  { id: "carlos", displayName: "Carlos Ficticio", phone: "+54 299 000 0104", address: "Pasaje de Ensayo 50, Neuquén", treatment: { status: "active", completedSessions: 9, totalSessions: 10, frequency: "1 vez por semana", nextVisit: { date: "2026-09-15", time: "15:00" } } },
  { id: "ana", displayName: "Ana Ejemplo", phone: "+54 299 000 0105", address: "Calle de Muestra 80, Neuquén", treatment: { status: "active", completedSessions: 2, totalSessions: 10, frequency: "2 veces por semana", nextVisit: { date: "2026-09-15" } } },
  { id: "julieta", displayName: "Julieta de Prueba", phone: "+54 299 000 0106", address: "Diagonal Ficticia 12, Neuquén", treatment: { status: "paused", completedSessions: 5, totalSessions: 12, frequency: "Pausado temporalmente" } },
  { id: "pedro", displayName: "Pedro Demostración", phone: "+54 299 000 0107", address: "Ruta de Ejemplo 7, Neuquén", treatment: { status: "active", completedSessions: 3, frequency: "Según tolerancia" } },
  { id: "laura", displayName: "Laura Ficticia", phone: "+54 299 000 0108", address: "Calle Laboratorio 22, Neuquén", treatment: { status: "active", completedSessions: 1, totalSessions: 8, frequency: "1 vez por semana" } },
  { id: "mario", displayName: "Mario Ejemplo", phone: "+54 299 000 0109", address: "Avenida Simulada 300, Neuquén", treatment: { status: "finished", completedSessions: 10, totalSessions: 10, frequency: "Finalizado" } },
];

const habitualItems: TodayItemViewModel[] = [
  { id: "visit-elena", patientId: "elena", date: "2026-09-15", scheduledTime: "08:00", sourceState: "completed", actualStart: "08:06", actualEnd: "08:58" },
  { id: "visit-martin", patientId: "martin", date: "2026-09-15", scheduledTime: "09:30", sourceState: "scheduled" },
  { id: "visit-rosa", patientId: "rosa", date: "2026-09-15", scheduledTime: "11:00", sourceState: "scheduled" },
  { id: "visit-carlos", patientId: "carlos", date: "2026-09-15", scheduledTime: "15:00", sourceState: "scheduled" },
  { id: "visit-ana", patientId: "ana", date: "2026-09-15", sourceState: "scheduled" },
];

function scenario(id: string, title: string, description: string, todayItems: TodayItemViewModel[], patientOverrides = patients): ClinicalHomeScenario {
  return { id, title, description, referenceNow: LAB_REFERENCE_NOW, patients: patientOverrides, todayItems };
}

const densePatients: HomePatientViewModel[] = [
  ...patients,
  ...Array.from({ length: 8 }, (_, index) => ({
    id: `extra-${index + 1}`,
    displayName: `Paciente Ficticio ${String(index + 1).padStart(2, "0")}`,
    phone: `+54 299 000 02${String(index + 1).padStart(2, "0")}`,
    address: `Calle de Prueba ${200 + index}, Neuquén`,
    treatment: { status: "active" as const, completedSessions: index + 1, totalSessions: 12, frequency: "2 veces por semana" },
  })),
];

export const clinicalHomeScenarios: ClinicalHomeScenario[] = [
  scenario("habitual", "Día habitual", "Una agenda con visitas finalizadas, pendientes, próximas y sin horario.", habitualItems),
  scenario("workflow", "Trabajo en curso", "Estados de atención, documentación y sincronización.", [
    { id: "prior-pedro", patientId: "pedro", date: "2026-09-14", scheduledTime: "17:00", sourceState: "care-ended", actualStart: "17:08", actualEnd: "18:00" },
    { id: "work-elena", patientId: "elena", date: "2026-09-15", scheduledTime: "08:00", sourceState: "confirmed-local", actualStart: "08:04", actualEnd: "08:55", syncError: true },
    { id: "work-martin", patientId: "martin", date: "2026-09-15", scheduledTime: "09:30", sourceState: "care-ended", actualStart: "09:35", actualEnd: "10:20" },
    { id: "work-rosa", patientId: "rosa", date: "2026-09-15", scheduledTime: "11:00", sourceState: "in-progress", actualStart: "10:57" },
  ]),
  scenario("changes", "Cambios de agenda", "Reprogramaciones, cancelaciones y una visita no programada.", [
    { id: "change-elena", patientId: "elena", date: "2026-09-15", scheduledTime: "08:00", sourceState: "completed", actualStart: "08:02", actualEnd: "08:50" },
    { id: "change-laura", patientId: "laura", date: "2026-09-15", scheduledTime: "14:00", sourceState: "rescheduled", rescheduledLabel: "Mañana · 10:00" },
    { id: "change-ana", patientId: "ana", date: "2026-09-15", scheduledTime: "16:30", sourceState: "cancelled", cancellationReason: "Cancelación registrada para revisar el estado visual." },
    { id: "change-pedro", patientId: "pedro", date: "2026-09-15", scheduledTime: "12:40", sourceState: "in-progress", actualStart: "12:40" },
  ]),
  scenario("incomplete", "Datos incompletos", "Ausencias de contacto, dirección, límite de sesiones y otras variantes.", habitualItems.slice(0, 4), patients.map((patient) => patient.id === "martin" ? { ...patient, phone: undefined } : patient.id === "carlos" ? { ...patient, address: undefined } : patient)),
  scenario("empty", "Día sin visitas", "Un día sin agenda, con el directorio todavía disponible.", []),
  scenario("dense", "Directorio extenso", "Volumen suficiente para revisar búsqueda, filtros y desplazamiento.", habitualItems, densePatients),
];

export function getClinicalHomeScenario(id?: string) {
  return clinicalHomeScenarios.find((item) => item.id === id) ?? clinicalHomeScenarios[0];
}
