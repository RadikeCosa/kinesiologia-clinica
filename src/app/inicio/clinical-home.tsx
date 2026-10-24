"use client";

import { ClinicalEnvironmentLabel } from "@/app/clinical-environment";
import { ClinicalCard } from "@/app/components/clinical-card";
import { ConsultationCard } from "@/app/consultas/consultation-card";
import { consultationsToAttend } from "@/features/clinical-home/consultations.presenter";
import Link from "next/link";
import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { addLocalDays, filterDirectory, formatArgentinePhone, formatFriendlyDate, formatFriendlyDateTime, formatWeekRange, getLocalDate, presentDay, presentWeek, resolveAgendaDate, startOfWeek } from "@/features/clinical-home/clinical-home.presenter";
import type { AgendaItemViewModel, ClinicalHomeData, HomePatientViewModel, PresentedTodayItem, TreatmentStatus } from "@/features/clinical-home/clinical-home.types";
import { beginVisit, changeAppointment, saveAppointment, type HomeActionState } from "./actions";

type Tab = "today" | "agenda" | "patients";
type DialogState =
  | { kind: "create" }
  | { kind: "schedule"; patient?: HomePatientViewModel; appointment?: AgendaItemViewModel; date?: string }
  | { kind: "close"; appointment: AgendaItemViewModel; operation: "cancelled" | "no-show" }
  | { kind: "actions"; appointment: AgendaItemViewModel; patientName: string }
  | { kind: "patient-more"; patient: HomePatientViewModel }
  | { kind: "start-untimed"; appointment: AgendaItemViewModel; patientName: string }
  | null;

const STATUS: Record<TreatmentStatus, string> = { active: "Activo", paused: "Pausado", finished: "Finalizado", "not-started": "Sin iniciar" };
const REASONS = [["patient-or-family", "Paciente o familia"], ["patient-not-at-home", "Paciente ausente del domicilio"], ["professional", "Profesional"], ["health-event", "Situación de salud"], ["logistics-or-weather", "Logística o clima"], ["other", "Otro"]] as const;
const initialHomeActionState: HomeActionState = { error: null };

function progress(patient: HomePatientViewModel, add = 0) {
  if (patient.treatment.periodUnavailable) return "Período sin verificar";
  const done = patient.treatment.completedSessions + add;
  return patient.treatment.totalSessions ? `${done} de ${patient.treatment.totalSessions}` : `${done} realizadas`;
}

function visitProgress(patient: HomePatientViewModel) {
  if (patient.treatment.periodUnavailable) return "Período sin verificar";
  const completed = patient.treatment.completedSessions;
  return patient.treatment.totalSessions ? `${completed} de ${patient.treatment.totalSessions} realizadas` : `${completed} realizadas`;
}

function formatSelectedDate(date: string, isToday: boolean) {
  const formatted = new Intl.DateTimeFormat("es-AR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));
  return `${isToday ? "Hoy, " : ""}${formatted}`;
}

function shiftMonth(month: string, offset: number) {
  const value = new Date(`${month}-01T12:00:00Z`);
  value.setUTCMonth(value.getUTCMonth() + offset);
  return value.toISOString().slice(0, 7);
}

function formatMonth(month: string) {
  const formatted = new Intl.DateTimeFormat("es-AR", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${month}-01T12:00:00Z`));
  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
}

function BeginVisitForm({ patientId, treatmentId, appointmentId, label, blockedReason }: { patientId: string; treatmentId?: string; appointmentId?: string; label: string; blockedReason?: string }) {
  const [clientVisitId] = useState(() => crypto.randomUUID());
  if (!treatmentId) return null;
  if (blockedReason) return <Link className="button-link" href={`/patients/${patientId}/periods`}>{blockedReason.includes("verificar") ? "Revisar período" : blockedReason.includes("Definir cupo") ? "Definir cupo del período" : blockedReason.includes("en curso") ? "Visita en curso" : "Revisar informe para continuar"}</Link>;
  return <form action={beginVisit}><input type="hidden" name="clientVisitId" value={clientVisitId}/><input type="hidden" name="patientId" value={patientId}/><input type="hidden" name="treatmentId" value={treatmentId}/>{appointmentId ? <input type="hidden" name="appointmentId" value={appointmentId}/> : null}<button className="home-primary-action">{label}</button></form>;
}

function PatientPrecautionIndicator({ patient, compact = false }: { patient: HomePatientViewModel; compact?: boolean }) {
  if (!patient.precautions?.length) return null;
  if (compact) return <div className="patient-precautions-inline"><strong>Precauciones</strong><span>{patient.precautions.join(" · ")}</span></div>;
  return <div className="patient-precautions"><strong>Precauciones</strong><span>{patient.precautions.join(" · ")}</span></div>;
}

function PatientPrecautionsDisclosure({ patient, compact = false }: { patient: HomePatientViewModel; compact?: boolean }) {
  if (!patient.precautions?.length) return null;
  return <details className={`patient-precautions-disclosure${compact ? " precaution-inline" : ""}`}><summary><span aria-hidden="true">!</span> {compact ? "Precauciones" : "Tiene precauciones"}</summary><ul>{patient.precautions.map((precaution) => <li key={precaution}>{precaution}</li>)}</ul></details>;
}

function PatientTreatmentSummary({ patient }: { patient: HomePatientViewModel }) {
  return <div className="patient-treatment-summary"><div className="patient-session-frequency"><strong>{patient.treatment.status === "not-started" ? "Sin tratamiento" : progress(patient)}</strong><span>{patient.treatment.frequency ?? "Frecuencia sin registrar"}</span></div>{patient.treatment.nextVisit ? <div className="patient-next-visit-summary"><span>Próxima visita</span><span className="patient-next-visit-full">{formatFriendlyDateTime(patient.treatment.nextVisit.date, patient.treatment.nextVisit.time)}</span><span className="patient-next-visit-compact">{formatFriendlyDateTime(patient.treatment.nextVisit.date, patient.treatment.nextVisit.time)}</span></div> : null}</div>;
}

function AccessibleDialog({ title, onClose, className = "", dismissOnBackdrop = false, children }: { title: string; onClose: () => void; className?: string; dismissOnBackdrop?: boolean; children: React.ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const outsidePointer = useRef<{ x: number; y: number } | null>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
    const firstControl = dialog?.querySelector<HTMLElement>("input:not([type=hidden]), select, textarea, button:not(.dialog-close), a[href]");
    firstControl?.focus();
  }, []);
  function isOutside(event: React.PointerEvent<HTMLDialogElement>) {
    if (event.target !== event.currentTarget) return false;
    const bounds = event.currentTarget.getBoundingClientRect();
    return event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom;
  }
  return <dialog ref={ref} className={`home-dialog ${className}`} onClose={onClose} aria-labelledby="home-dialog-title" onCancel={() => ref.current?.close()}
    onPointerDown={event => { outsidePointer.current = dismissOnBackdrop && event.button === 0 && isOutside(event) ? { x: event.clientX, y: event.clientY } : null; }}
    onPointerCancel={() => { outsidePointer.current = null; }}
    onPointerUp={event => {
      const start = outsidePointer.current;
      outsidePointer.current = null;
      if (start && isOutside(event) && Math.hypot(event.clientX - start.x, event.clientY - start.y) < 8) event.currentTarget.close();
    }}>
    <button className="dialog-close" type="button" onClick={() => ref.current?.close()} aria-label="Cerrar">×</button>
    <h2 id="home-dialog-title">{title}</h2>{children}
  </dialog>;
}

function CreateOptions({ onClose, onSchedule }: { onClose: () => void; onSchedule: () => void }) {
  return <AccessibleDialog title="Crear" className="home-action-sheet" dismissOnBackdrop onClose={onClose}><div className="action-sheet-list"><Link href="/consultas/nueva">Nueva consulta</Link><Link href="/patients/new">Nuevo paciente</Link><button type="button" onClick={onSchedule}>Agendar visita</button></div></AccessibleDialog>;
}

function ScheduleForm({ patients, state, onClose }: { patients: HomePatientViewModel[]; state: Exclude<DialogState, null> & { kind: "schedule" }; onClose: () => void }) {
  const [result, action, pending] = useActionState(saveAppointment, initialHomeActionState);
  const [id] = useState(() => crypto.randomUUID());
  const appointment = state.appointment;
  const fixedPatient = state.patient ?? patients.find((item) => item.id === appointment?.patientId);
  const [patientId, setPatientId] = useState(fixedPatient?.id ?? "");
  const [date, setDate] = useState(appointment?.scheduledDate ?? state.date ?? "");
  const [time, setTime] = useState(appointment?.scheduledTime ?? "");
  const [duration, setDuration] = useState(String(appointment?.durationMinutes ?? 60));
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [acknowledgedConflict, setAcknowledgedConflict] = useState(false);
  useEffect(() => { if (result.success) onClose(); }, [result.success, onClose]);
  return <AccessibleDialog title={appointment ? "Reprogramar visita" : "Agendar visita"} onClose={onClose}>
    <form action={action} className="home-form">
      <input type="hidden" name="mode" value={appointment ? "reschedule" : "create"}/><input type="hidden" name="clientAppointmentId" value={id}/>
      {appointment ? <><input type="hidden" name="appointmentId" value={appointment.id}/><input type="hidden" name="expectedVersion" value={appointment.version ?? ""}/></> : null}
      {fixedPatient ? <><input type="hidden" name="patientId" value={fixedPatient.id}/><p><strong>{fixedPatient.displayName}</strong></p></> : <label>Paciente<select name="patientId" required value={patientId} onChange={(event) => setPatientId(event.target.value)}><option value="" disabled>Elegí un paciente</option>{patients.filter((item) => item.treatment.status === "active").map((item) => <option key={item.id} value={item.id}>{item.displayName}</option>)}</select></label>}
      <label>Fecha<input name="date" type="date" required value={date} onChange={(event) => setDate(event.target.value)}/></label>
      <label>Horario opcional<input name="time" type="time" value={time} onChange={(event) => setTime(event.target.value)}/></label>
      <label>Duración prevista<select name="durationMinutes" value={duration} onChange={(event) => setDuration(event.target.value)}>{[15,30,45,60,75,90,120,180,240].map((value) => <option key={value} value={value}>{value} minutos</option>)}</select></label>
      {appointment ? <><label>Motivo<select name="reason" required value={reason} onChange={(event) => setReason(event.target.value)}><option value="" disabled>Elegí un motivo</option>{REASONS.map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>Nota opcional<textarea name="note" maxLength={500} rows={3} value={note} onChange={(event) => setNote(event.target.value)}/></label></> : null}
      {result.conflict ? <label className="home-confirm"><input type="checkbox" name="acknowledgeConflict" value="true" required checked={acknowledgedConflict} onChange={(event) => setAcknowledgedConflict(event.target.checked)}/> Guardar aunque se superponga</label> : null}
      {result.error ? <p className="form-error" role="alert">{result.error}</p> : null}
      <button className="home-primary-action" disabled={pending} type="submit">{pending ? "Guardando…" : result.conflict ? "Confirmar horario" : appointment ? "Guardar reprogramación" : "Agendar visita"}</button>
    </form>
  </AccessibleDialog>;
}

function CloseForm({ state, onClose }: { state: Exclude<DialogState, null> & { kind: "close" }; onClose: () => void }) {
  const [result, action, pending] = useActionState(changeAppointment, initialHomeActionState);
  useEffect(() => { if (result.success) onClose(); }, [result.success, onClose]);
  return <AccessibleDialog title={state.operation === "no-show" ? "La visita no se realizó" : "Cancelar visita"} onClose={onClose}>
    <form action={action} className="home-form">
      <input type="hidden" name="appointmentId" value={state.appointment.id}/><input type="hidden" name="expectedVersion" value={state.appointment.version ?? ""}/><input type="hidden" name="operation" value={state.operation}/>
      <p>{state.appointment.patientName} · {state.appointment.scheduledDate} {state.appointment.scheduledTime ?? "sin horario"}</p>
      <label>Motivo<select name="reason" required defaultValue=""><option value="" disabled>Elegí un motivo</option>{REASONS.map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label>Nota opcional<textarea name="note" maxLength={500} rows={3}/></label>
      {result.error ? <p className="form-error" role="alert">{result.error}</p> : null}
      <button className="home-primary-action" disabled={pending} type="submit">{pending ? "Guardando…" : "Confirmar"}</button>
    </form>
  </AccessibleDialog>;
}

function AppointmentActions({ state, patient, referenceNow, canNoShow, onStartUntimed, onSchedule, onCloseAppointment, onClose }: { state: Exclude<DialogState, null> & { kind: "actions" }; patient?: HomePatientViewModel; referenceNow: string; canNoShow: boolean; onStartUntimed: () => void; onSchedule: () => void; onCloseAppointment: (operation: "cancelled" | "no-show") => void; onClose: () => void }) {
  const canRegister = !patient?.treatment.visitBlockedReason && state.appointment.scheduledDate <= getLocalDate(referenceNow);
  const isPrevious = state.appointment.scheduledDate < getLocalDate(referenceNow);
  return <AccessibleDialog title="Opciones de la visita" className="home-action-sheet" dismissOnBackdrop onClose={onClose}>
    <p className="action-sheet-context"><strong>{state.patientName}</strong><br/>{formatFriendlyDateTime(state.appointment.scheduledDate, state.appointment.scheduledTime)}</p>
    {patient ? <PatientPrecautionIndicator patient={patient}/> : null}
    <section className="more-option-group" aria-labelledby="visit-options-heading"><h3 id="visit-options-heading">Visita</h3><div className="action-sheet-list">
      {canRegister && !isPrevious && state.appointment.status === "booked" ? <BeginVisitForm patientId={state.appointment.patientId} treatmentId={state.appointment.treatmentId} appointmentId={state.appointment.id} label="Comenzar visita"/> : null}
      {canRegister && !isPrevious && state.appointment.status === "proposed" ? <button type="button" onClick={onStartUntimed}>Comenzar visita</button> : null}
      {canRegister ? <Link href={`/patients/${state.appointment.patientId}/visits/new?cita=${state.appointment.id}&modo=diferida`}>Registrar visita</Link> : null}
      <button type="button" onClick={onSchedule}>Reprogramar</button><button type="button" onClick={() => onCloseAppointment("cancelled")}>Cancelar visita</button>{canNoShow ? <button type="button" onClick={() => onCloseAppointment("no-show")}>No se realizó</button> : null}
    </div></section>
    {patient ? <><Link className="action-sheet-patient-link" href={`/patients/${patient.id}`}>Ver ficha del paciente</Link><PatientContactOptions patient={patient}/></> : null}
  </AccessibleDialog>;
}

function PatientContactOptions({ patient }: { patient: HomePatientViewModel }) {
  if (!patient.phone && !patient.address && !patient.accessInstructions) return null;
  return <section className="more-option-group" aria-labelledby="patient-contact-heading">
    <h3 id="patient-contact-heading">Contacto</h3>
    {patient.phone ? <><p className="action-sheet-context"><strong>Teléfono</strong><br/>{formatArgentinePhone(patient.phone)}</p><div className="action-sheet-list"><a href={`tel:${patient.phone}`}>Llamar</a><a href={`https://wa.me/${patient.phone.replace(/\D/g, "")}`}>Enviar mensaje por WhatsApp</a></div></> : null}
    {patient.address ? <><p className="action-sheet-context"><strong>Dirección</strong><br/>{patient.address}</p><div className="action-sheet-list"><a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(patient.address)}`} target="_blank" rel="noopener noreferrer">Ver mapa<span className="sr-only"> (se abre en una pestaña nueva)</span></a></div></> : null}
    {patient.accessInstructions ? <div className="location-instructions"><strong>Indicaciones para llegar</strong><p>{patient.accessInstructions}</p></div> : null}
  </section>;
}

function PatientMoreOptions({ patient, onClose }: { patient: HomePatientViewModel; onClose: () => void }) {
  return <AccessibleDialog title="Más opciones" className="home-action-sheet" dismissOnBackdrop onClose={onClose}>
    <p className="action-sheet-context"><strong>{patient.displayName}</strong></p>
    <PatientContactOptions patient={patient}/>
    <Link className="action-sheet-patient-link" href={`/patients/${patient.id}`}>Ver ficha del paciente</Link>
  </AccessibleDialog>;
}

function ConfirmUntimedStart({ state, onClose }: { state: Exclude<DialogState, null> & { kind: "start-untimed" }; onClose: () => void }) {
  return <AccessibleDialog title="Comenzar visita ahora" onClose={onClose}>
    <p className="action-sheet-context"><strong>{state.patientName}</strong></p>
    <p>Esta visita no tenía horario. Al continuar se registrará el inicio con la hora actual y no se calculará puntualidad.</p>
    <div className="dialog-actions"><button type="button" className="secondary-button" onClick={onClose}>Volver</button><BeginVisitForm patientId={state.appointment.patientId} treatmentId={state.appointment.treatmentId} appointmentId={state.appointment.id} label="Confirmar y comenzar"/></div>
  </AccessibleDialog>;
}

function appointmentFromItem(item: PresentedTodayItem, known?: AgendaItemViewModel): AgendaItemViewModel | undefined {
  if (known) return known;
  if (!item.appointmentVersion && !["scheduled-no-time", "upcoming", "past-unresolved"].includes(item.displayState)) return undefined;
  return { id: item.id, patientId: item.patientId, patientName: item.patient.displayName, treatmentId: item.treatmentId ?? item.patient.treatment.id ?? "", scheduledDate: item.date, scheduledTime: item.scheduledTime, durationMinutes: 60, status: item.scheduledTime ? "booked" : "proposed", statusLabel: item.statusLabel, version: item.appointmentVersion };
}

function canMarkNoShow(appointment: AgendaItemViewModel, referenceNow: string) {
  const today = getLocalDate(referenceNow);
  if (!appointment.scheduledTime) return appointment.scheduledDate < today;
  return new Date(`${appointment.scheduledDate}T${appointment.scheduledTime}:00-03:00`) <= new Date(referenceNow);
}

function visitTimingLabel(item: PresentedTodayItem) {
  if (item.startPunctuality === "on-time") return "Puntual";
  if (item.startPunctuality === "delayed") return "Leve demora";
  if (item.startPunctuality === "severely-delayed") return "Demora";
  return null;
}

function documentationTimingLabel(item: PresentedTodayItem) {
  if (item.documentationTimeliness === "later") return "Carga diferida";
  if (item.documentationTimeliness === "same-day") return "Registrada el mismo día";
  return null;
}

function VisitCard({ item, appointment, referenceNow, onDialog }: { item: PresentedTodayItem; appointment?: AgendaItemViewModel; referenceNow: string; onDialog: (dialog: Exclude<DialogState, null>, trigger: HTMLElement) => void }) {
  const future = item.date > getLocalDate(referenceNow);
  const previous = item.date < getLocalDate(referenceNow);
  const punctuality = visitTimingLabel(item);
  const documentationTiming = documentationTimingLabel(item);
  const hasVisitOptions = Boolean(appointment && ["booked", "proposed"].includes(appointment.status));
  const showMore = Boolean(item.patient.phone || item.patient.address || item.patient.accessInstructions || hasVisitOptions);
  const actions = <div className="visit-actions">
      <div className="visit-clinical-actions">
        {item.displayState === "in-progress" && item.visitId ? <Link className="home-primary-action button-link" href={`/patients/${item.patientId}/visits/${item.visitId}/edit`}>Continuar</Link> : null}
        {!item.patient.treatment.visitBlockedReason && appointment && (previous || item.displayState === "past-unresolved") && ["booked", "proposed"].includes(appointment.status) ? <Link className="home-primary-action button-link" href={`/patients/${encodeURIComponent(item.patientId)}/visits/new?cita=${encodeURIComponent(appointment.id)}&modo=diferida`}>Registrar visita</Link> : null}
        {appointment?.status === "booked" && item.displayState === "upcoming" ? <BeginVisitForm blockedReason={item.patient.treatment.visitBlockedReason} patientId={item.patientId} treatmentId={item.treatmentId} appointmentId={item.id} label="Comenzar visita"/> : null}
        {!item.patient.treatment.visitBlockedReason && appointment?.status === "proposed" && !future && !previous ? <button className="home-primary-action" type="button" onClick={(event) => onDialog({ kind: "start-untimed", appointment, patientName: item.patient.displayName }, event.currentTarget)}>Comenzar visita</button> : null}
        {appointment?.status === "proposed" && future ? <button className="home-primary-action" type="button" onClick={(event) => onDialog({ kind: "schedule", appointment }, event.currentTarget)}>Definir horario</button> : null}
        {future && item.displayState === "upcoming" ? <Link className="button-link" href={`/patients/${item.patientId}`}>Ver paciente</Link> : null}
      </div>
      <div className="visit-utility-actions">
        {showMore ? <button type="button" className="more-action" onClick={(event) => hasVisitOptions && appointment ? onDialog({ kind: "actions", appointment, patientName: item.patient.displayName }, event.currentTarget) : onDialog({ kind: "patient-more", patient: item.patient }, event.currentTarget)} aria-label={`Más opciones para ${item.patient.displayName}`}>Más</button> : null}
      </div>
    </div>;
  return <ClinicalCard id={`appointment-${item.id}`} className={`visit-card state-${item.displayState}`}
    title={item.patient.displayName} href={`/patients/${item.patientId}`}
    badge={<span className="home-status">{item.statusLabel}</span>}
    identityDetail={<PatientPrecautionIndicator patient={item.patient} compact/>}
    actions={actions}>
    <div className="visit-summary-block">
      <strong className="visit-time">{item.scheduledTime ? `${item.scheduledTime} hs` : "Sin horario"}</strong>
      <p className="treatment-progress">{visitProgress(item.patient)}</p>
      {punctuality ? <span className="visit-timing-badge">{punctuality}</span> : null}
      {documentationTiming ? <span className="visit-documentation-badge">{documentationTiming}</span> : null}
      {item.actualStart ? <p className="home-detail">Inicio real {item.actualStart}{item.actualEnd ? ` · Finalizó ${item.actualEnd}` : ""}</p> : null}
    </div>
  </ClinicalCard>;
}

function compactDate(date: string) {
  const [, month, day] = date.split("-");
  return `${day}/${month}`;
}

function HistoryRows({ items, showOriginalDate = false }: { items: PresentedTodayItem[]; showOriginalDate?: boolean }) {
  return <div className={`history-list${showOriginalDate ? " history-list-with-date" : ""}`}>{items.map((item) => <div className="history-row" key={item.id}><span>{showOriginalDate ? `${compactDate(item.date)} · ` : ""}{item.scheduledTime ? `${item.scheduledTime} hs` : "Sin horario"}</span><strong><Link href={`/patients/${item.patientId}`}>{item.patient.displayName}</Link></strong><span>{item.statusLabel}</span>{item.displayState === "rescheduled" && item.rescheduledToDate ? <span className="history-reschedule">Nueva: {compactDate(item.rescheduledToDate)}{item.rescheduledToTime ? ` · ${item.rescheduledToTime} hs` : " · sin horario"}</span> : null}{item.visitId && item.displayState === "completed" ? <Link className="history-detail-link" href={`/patients/${item.patientId}/visits/${item.visitId}`}>Ver registro completo</Link> : null}</div>)}</div>;
}

export function ClinicalHome({ data, initialTab = "today", initialPatientId, initialResolveAppointmentId, initialSelectedDate, initialWeekStart, initialShowPending = false }: { data: ClinicalHomeData; initialTab?: Tab; initialPatientId?: string; initialResolveAppointmentId?: string; initialSelectedDate?: string; initialWeekStart?: string; initialShowPending?: boolean }) {
  const week = useMemo(() => presentWeek(data.referenceNow, data.dayItems), [data]);
  const validInitialDate = week.some((day) => day.date === initialSelectedDate) ? initialSelectedDate! : week[0].date;
  const today = getLocalDate(data.referenceNow);
  const initialAgendaDate = resolveAgendaDate(today, initialSelectedDate, initialWeekStart);
  const [selectedDate, setSelectedDate] = useState(validInitialDate);
  const [selectedAgendaDate, setSelectedAgendaDate] = useState(initialAgendaDate);
  const [agendaWeekStart, setAgendaWeekStart] = useState(initialSelectedDate ? startOfWeek(initialAgendaDate) : initialWeekStart && /^\d{4}-\d{2}-\d{2}$/.test(initialWeekStart) ? startOfWeek(initialWeekStart) : startOfWeek(initialAgendaDate));
  const [mobileAgendaMode, setMobileAgendaMode] = useState<"week" | "month">("week");
  const [tab, setTab] = useState<Tab>(initialTab);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<TreatmentStatus | "all">("active");
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const [dialog, setDialog] = useState<DialogState>(() => {
    const appointment = data.agendaItems.find((item) => item.id === initialResolveAppointmentId && item.scheduledDate < today && ["booked", "proposed"].includes(item.status));
    if (appointment) return { kind: "actions", appointment, patientName: appointment.patientName };
    const patient = data.patients.find((item) => item.id === initialPatientId);
    return patient ? { kind: "schedule", patient, date: validInitialDate } : null;
  });
  const day = useMemo(() => presentDay({ referenceNow: data.referenceNow, selectedDate, patients: data.patients, dayItems: data.dayItems }), [data, selectedDate]);
  const patients = useMemo(() => filterDirectory(data.patients, query, filter), [data.patients, query, filter]);
  const consultationTasks = consultationsToAttend(data.openConsultations ?? [], data.referenceNow);
  const [pendingOpen, setPendingOpen] = useState(Boolean(initialResolveAppointmentId));
  const agendaCounts = useMemo(() => data.agendaItems.reduce((grouped, item) => grouped.set(item.scheduledDate, (grouped.get(item.scheduledDate) ?? 0) + 1), new Map<string, number>()), [data.agendaItems]);
  const agendaDays = useMemo(() => {
    const offset = (new Date(`${data.agendaFrom}T12:00:00Z`).getUTCDay() + 6) % 7;
    const values: Array<string | null> = Array.from({ length: offset }, () => null);
    for (let date = data.agendaFrom; date <= data.agendaTo;) {
      values.push(date);
      const value = new Date(`${date}T12:00:00Z`); value.setUTCDate(value.getUTCDate() + 1); date = value.toISOString().slice(0, 10);
    }
    return values;
  }, [data.agendaFrom, data.agendaTo]);
  const selectedAgendaItems = useMemo(() => data.agendaItems.filter((item) => item.scheduledDate === selectedAgendaDate), [data.agendaItems, selectedAgendaDate]);
  const selectedAgendaItemsForDisplay = useMemo(() => selectedAgendaItems.filter((item) => !(item.scheduledDate < today && ["booked", "proposed"].includes(item.status))), [selectedAgendaItems, today]);
  const agendaWeekDays = useMemo(() => Array.from({ length: 7 }, (_, index) => addLocalDays(agendaWeekStart, index)), [agendaWeekStart]);
  const overdueAgendaItems = useMemo(() => data.agendaItems.filter((item) => item.scheduledDate < today && ["booked", "proposed"].includes(item.status)), [data.agendaItems, today]);

  function openDialog(next: Exclude<DialogState, null>, trigger?: HTMLElement) { if (trigger) returnFocusRef.current = trigger; setDialog(next); }
  function closeDialog() { setDialog(null); const url = new URL(window.location.href); if (url.searchParams.has("resolver")) { url.searchParams.delete("resolver"); window.history.replaceState(null, "", `${url.pathname}${url.search}`); } window.requestAnimationFrame(() => returnFocusRef.current?.focus()); }
  function selectTab(next: Tab) { setTab(next); const suffix = next === "today" ? `hoy&fecha=${selectedDate}` : next === "agenda" ? `agenda&mes=${selectedAgendaDate.slice(0, 7)}&fecha=${selectedAgendaDate}&semana=${agendaWeekStart}` : "pacientes"; window.history.pushState(null, "", `/inicio?vista=${suffix}`); }
  function selectDate(date: string) { setSelectedDate(date); setTab("today"); window.history.replaceState(null, "", `/inicio?vista=hoy&fecha=${date}`); }
  function selectAgendaDate(date: string) { const weekStart = startOfWeek(date); setSelectedAgendaDate(date); setAgendaWeekStart(weekStart); window.history.pushState(null, "", `/inicio?vista=agenda&mes=${date.slice(0, 7)}&fecha=${date}&semana=${weekStart}`); }
  function selectAgendaWeek(nextStart: string) { setAgendaWeekStart(nextStart); selectAgendaDate(nextStart); }
  function goToToday() { selectAgendaDate(today); }
  const heading = tab === "today" ? (day.isToday ? "Hoy" : new Intl.DateTimeFormat("es-AR", { weekday: "long", timeZone: "UTC" }).format(new Date(`${selectedDate}T12:00:00Z`))) : tab === "agenda" ? "Agenda" : "Pacientes";
  const selectedLabel = formatSelectedDate(selectedDate, day.isToday);
  const appointmentFor = (item: PresentedTodayItem) => appointmentFromItem(item, data.agendaItems.find((value) => value.id === item.id));
  const actionableCount = day.timed.length + day.withoutTime.length + (day.activeVisit ? 1 : 0);
  useEffect(() => {
    if (initialTab === "today" && initialSelectedDate && initialSelectedDate !== validInitialDate) {
      window.history.replaceState(null, "", `/inicio?vista=hoy&fecha=${validInitialDate}`);
    }
  }, [initialSelectedDate, initialTab, validInitialDate]);
  useEffect(() => {
    if (initialResolveAppointmentId) returnFocusRef.current = document.getElementById(`appointment-${initialResolveAppointmentId}`);
  }, [initialResolveAppointmentId]);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 42rem)");
    const resetMobileMode = (event: MediaQueryListEvent) => { if (event.matches) setMobileAgendaMode("week"); };
    media.addEventListener("change", resetMobileMode);
    return () => media.removeEventListener("change", resetMobileMode);
  }, []);
  useEffect(() => {
    const syncFromUrl = () => {
      const params = new URL(window.location.href).searchParams;
      const nextTab = params.get("vista") === "agenda" ? "agenda" : params.get("vista") === "pacientes" ? "patients" : "today";
      const nextDate = params.get("fecha");
      const nextWeek = params.get("semana");
      if (nextTab === "agenda") {
        const agendaDate = resolveAgendaDate(today, nextDate ?? undefined, nextWeek ?? undefined);
        setSelectedAgendaDate(agendaDate);
        setAgendaWeekStart(startOfWeek(agendaDate));
      }
      setTab(nextTab);
    };
    window.addEventListener("popstate", syncFromUrl);
    return () => window.removeEventListener("popstate", syncFromUrl);
  }, [today]);
  return <main className="clinical-home-shell clinical-home-real">
    <p className="eyebrow"><ClinicalEnvironmentLabel/></p>
    <header className="operational-header"><div><h1>{heading.charAt(0).toUpperCase() + heading.slice(1)}</h1><p>{tab === "today" ? selectedLabel.replace(/^Hoy,\s*/, "") : "Kinesiología Clínica"}</p></div><button aria-label="Crear: Agendar visita o alta" className="home-primary-action schedule-shortcut" onClick={(event) => openDialog({ kind: "create" }, event.currentTarget)}>＋ Crear</button></header>
    <nav className="home-tabs home-tabs-three" aria-label="Vista principal">{([["today","Hoy"],["agenda","Agenda"],["patients","Pacientes"]] as const).map(([value,label]) => <button key={value} type="button" aria-current={tab === value ? "page" : undefined} onClick={() => selectTab(value)}>{label}</button>)}</nav>


    {tab === "today" ? <section className="operational-day" aria-labelledby="day-heading">
      <div className="week-strip" aria-label="Próximos siete días">{week.map((weekDay) => <button type="button" key={weekDay.date} aria-label={weekDay.fullLabel} aria-pressed={selectedDate === weekDay.date} onClick={() => selectDate(weekDay.date)}><span>{weekDay.weekdayLabel}</span><strong>{weekDay.dayLabel}</strong><small>{weekDay.visitCount || "–"}</small></button>)}</div>
      <div className="day-heading"><p id="day-heading" aria-live="polite">{actionableCount} {actionableCount === 1 ? "visita por atender" : "visitas por atender"}</p></div>
      {day.activeVisit ? <section className="operational-section priority-section"><h2>Visita en curso</h2><VisitCard item={day.activeVisit} appointment={appointmentFor(day.activeVisit)} referenceNow={data.referenceNow} onDialog={openDialog}/></section> : null}

      {day.timed.length ? <section className="operational-section"><h2>{day.isToday ? "Horarios de hoy" : "Con horario"}</h2><div className="today-list">{day.timed.map((item) => <VisitCard key={item.id} item={item} appointment={appointmentFor(item)} referenceNow={data.referenceNow} onDialog={openDialog}/>)}</div></section> : null}
      {day.withoutTime.length ? <section className="operational-section"><h2>Sin horario definido</h2><div className="today-list">{day.withoutTime.map((item) => <VisitCard key={item.id} item={item} appointment={appointmentFor(item)} referenceNow={data.referenceNow} onDialog={openDialog}/>)}</div></section> : null}
      {!day.activeVisit && !day.timed.length && !day.withoutTime.length ? <div className="day-empty"><h3>No hay visitas previstas</h3><p>Podés agendar una visita directamente para este día.</p><button className="home-primary-action" onClick={(event) => openDialog({ kind: "schedule", date: selectedDate }, event.currentTarget)}>Agendar en este día</button></div> : null}
      {day.isToday ? <section className="consultation-attention operational-section" aria-labelledby="consultations-heading">
        <div className="section-heading-with-action"><div><h2 id="consultations-heading">Consultas por atender <span className="section-count">{consultationTasks.length}</span></h2><p>Contactos pendientes y consultas sin próximo paso.</p></div><Link href="/consultas">Ver todas</Link></div>
        {consultationTasks.length ? <>
          {([['follow-up', 'Seguimientos'], ['no-next-step', 'Sin próximo paso']] as const).map(([group, label]) => {
            const tasks = consultationTasks.slice(0, 3).filter(task => task.attention.group === group);
            return tasks.length ? <section className="consultation-task-group" key={group} aria-label={label}><h3>{label}</h3><div className="consultation-task-list">{tasks.map(task => <ConsultationCard key={task.consultation.id} consultation={task.consultation} description={task.attention.label} headingLevel={4}/>)}</div></section> : null;
          })}
          {consultationTasks.length > 3 ? <p className="consultation-overflow">Mostrando 3 de {consultationTasks.length}. <Link href="/consultas">Ver todas las consultas</Link></p> : null}
        </> : <p className="consultation-empty">No hay consultas por atender hoy.</p>}
      </section> : null}
      {day.previousPending.length ? <details className="pending-visits operational-section" open={pendingOpen} onToggle={event => setPendingOpen(event.currentTarget.open)}>
        <summary><h2>Visitas pendientes de días anteriores <span className="section-count">{day.previousPending.length}</span></h2><span className="disclosure-chevron" aria-hidden="true">⌄</span></summary>
        <div className="pending-visits-content"><Link className="clinical-card-link" href={`/inicio?vista=agenda&mes=${today.slice(0, 7)}&fecha=${today}&pendientes=1`}>Ver en Agenda <span aria-hidden="true">→</span></Link><div className="today-list">{day.previousPending.map(item => <div className="pending-visit" key={item.id}><p className="pending-original-date">{formatFriendlyDate(item.date)}</p><VisitCard item={item} appointment={appointmentFor(item)} referenceNow={data.referenceNow} onDialog={openDialog}/></div>)}</div></div>
      </details> : null}
      {day.completed.length ? <details className="history-group"><summary>Realizadas <span>{day.completed.length}</span></summary><HistoryRows items={day.completed}/></details> : null}
      {day.changes.length ? <details className="history-group"><summary>Cambios registrados hoy <span>{day.changes.length}</span></summary><p className="history-helper">Incluye cambios sobre visitas de hoy y de otros días.</p><HistoryRows items={day.changes} showOriginalDate/></details> : null}
    </section> : null}

    {tab === "agenda" ? <section className={`home-view agenda-view${mobileAgendaMode === "month" ? " mobile-show-month" : ""}`}>
      <div className="agenda-week-view" aria-label={`Semana del ${formatWeekRange(agendaWeekStart)}`}>
        <div className="week-heading"><button type="button" className="month-navigation" onClick={() => selectAgendaWeek(addLocalDays(agendaWeekStart, -7))} aria-label="Semana anterior">‹</button><div><h2>{formatWeekRange(agendaWeekStart)}</h2><button type="button" className="text-navigation" onClick={goToToday}>Ir a hoy</button></div><button type="button" className="month-navigation" onClick={() => selectAgendaWeek(addLocalDays(agendaWeekStart, 7))} aria-label="Semana siguiente">›</button></div>
        <div className="agenda-week-strip">{agendaWeekDays.map((date) => <button type="button" key={date} aria-label={`${formatFriendlyDate(date)}, ${agendaCounts.get(date) ?? 0} visitas`} aria-pressed={selectedAgendaDate === date} className={date === today ? "is-today" : undefined} onClick={() => selectAgendaDate(date)}><span>{new Intl.DateTimeFormat("es-AR", { weekday: "short", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`)).replace(".", "")}</span><strong>{Number(date.slice(-2))}</strong><small>{agendaCounts.get(date) || "–"}</small></button>)}</div>
        <button type="button" className="month-toggle" onClick={() => setMobileAgendaMode("month")}>Ver mes</button>
      </div>
      <div className="agenda-month-view">
        <div className="month-heading"><Link className="month-navigation" href={`/inicio?vista=agenda&mes=${shiftMonth(data.agendaMonth, -1)}&fecha=${shiftMonth(data.agendaMonth, -1)}-01`} aria-label="Mes anterior">‹</Link><div><h2>{formatMonth(data.agendaMonth)}</h2><Link href={`/inicio?vista=agenda&mes=${today.slice(0, 7)}&fecha=${today}`}>Ir a hoy</Link></div><Link className="month-navigation" href={`/inicio?vista=agenda&mes=${shiftMonth(data.agendaMonth, 1)}&fecha=${shiftMonth(data.agendaMonth, 1)}-01`} aria-label="Mes siguiente">›</Link></div>
        <div className="month-calendar" aria-label={`Calendario de ${formatMonth(data.agendaMonth)}`}>
          {(["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"] as const).map((label) => <span className="calendar-weekday" key={label}>{label}</span>)}
          {agendaDays.map((date, index) => date ? <button key={date} type="button" aria-label={`${formatFriendlyDate(date)}, ${agendaCounts.get(date) ?? 0} visitas`} aria-pressed={selectedAgendaDate === date} className={date === today ? "is-today" : undefined} onClick={() => selectAgendaDate(date)}><span>{Number(date.slice(-2))}</span>{agendaCounts.get(date) ? <small>{agendaCounts.get(date)}</small> : null}</button> : <span className="calendar-empty" key={`empty-${index}`}/>) }
        </div>
        <button type="button" className="month-toggle" onClick={() => setMobileAgendaMode("week")}>Ver semana</button>
      </div>
      {overdueAgendaItems.length ? <details className="history-group agenda-pending" open={initialShowPending}><summary>Visitas pendientes de días anteriores <span>{overdueAgendaItems.length}</span></summary><div className="agenda-pending-list">{overdueAgendaItems.map((item) => <div key={item.id}><span>{formatFriendlyDateTime(item.scheduledDate, item.scheduledTime)}</span><Link href={`/patients/${item.patientId}`}>{item.patientName}</Link><Link className="home-primary-action button-link" href={`/patients/${encodeURIComponent(item.patientId)}/visits/new?cita=${encodeURIComponent(item.id)}&modo=diferida`}>Registrar visita</Link></div>)}</div></details> : null}
      <section className="agenda-selected-day" aria-labelledby="agenda-selected-heading"><div className="agenda-day-heading"><div><p>Día seleccionado</p><h2 id="agenda-selected-heading">{formatFriendlyDate(selectedAgendaDate)}</h2></div><span aria-live="polite">{selectedAgendaItemsForDisplay.length} {selectedAgendaItemsForDisplay.length === 1 ? "visita" : "visitas"}</span></div>
        <div className="agenda-day-list">{selectedAgendaItemsForDisplay.map((item) => <article className="home-card agenda-card" key={item.id}><div className="agenda-card-time"><strong>{item.scheduledTime ? `${item.scheduledTime} hs` : "Sin horario"}</strong>{item.durationMinutes ? <span>{item.durationMinutes} min</span> : null}</div><div className="agenda-card-patient"><h3><Link className="patient-name-link" href={`/patients/${item.patientId}`}>{item.patientName}</Link></h3><span className="home-status">{item.statusLabel}</span></div>{["booked", "proposed"].includes(item.status) ? <button type="button" className="more-action agenda-more" onClick={(event) => openDialog({kind:"actions", appointment:item, patientName:item.patientName}, event.currentTarget)} aria-label={`Más opciones para ${item.patientName}`}>Más</button> : null}</article>)}</div>
        {!selectedAgendaItemsForDisplay.length ? <div className="day-empty"><h3>{selectedAgendaDate < today ? "No hubo visitas agendadas" : "No hay visitas previstas"}</h3>{selectedAgendaDate >= today ? <><p>Podés agendar una visita para este día.</p><button className="home-primary-action" onClick={(event) => openDialog({kind:"schedule", date:selectedAgendaDate}, event.currentTarget)}>Agendar en este día</button></> : <p>Las visitas pendientes anteriores aparecen arriba.</p>}</div> : null}
      </section>
    </section> : null}

    {tab === "patients" ? <section className="home-view patients-view"><div className="directory-tools-heading"><label className="directory-search">Buscar por nombre, teléfono o dirección<input type="search" value={query} onChange={(event)=>setQuery(event.target.value)}/></label><p aria-live="polite">{patients.length} {patients.length === 1 ? "resultado" : "resultados"}</p></div><div className="directory-filters" aria-label="Filtros de pacientes">{(["active","paused","finished","not-started","all"] as const).map((value)=><button type="button" key={value} aria-pressed={filter===value} onClick={()=>setFilter(value)}>{value==="all"?"Todos":STATUS[value]}</button>)}</div><div className="directory-list">{patients.length ? patients.map((patient)=><article className="home-card directory-card" key={patient.id}><div className="home-card-heading"><div className="patient-heading-main"><h3><Link className="patient-name-link" href={`/patients/${patient.id}`}>{patient.displayName}</Link></h3><span className={`treatment-state treatment-${patient.treatment.status}`}>{STATUS[patient.treatment.status]}</span></div><PatientTreatmentSummary patient={patient}/>{patient.treatment.periodPhase === "report-pending" ? <Link href={`/patients/${patient.id}/periods`}>Informe pendiente</Link> : null}</div><PatientPrecautionsDisclosure patient={patient}/><div className="home-actions directory-primary-actions">{patient.treatment.status==="active"?<><button className="home-primary-action" onClick={(event)=>openDialog({kind:"schedule",patient,date:selectedDate}, event.currentTarget)}>Agendar visita</button><BeginVisitForm blockedReason={patient.treatment.visitBlockedReason} patientId={patient.id} treatmentId={patient.treatment.id} label="Comenzar visita"/></>:patient.treatment.status === "not-started"?<Link className="primary-link" href={`/patients/${patient.id}`}>Comenzar tratamiento</Link>:null}{patient.phone || patient.address || patient.accessInstructions ? <button type="button" className="more-action directory-more" onClick={(event)=>openDialog({kind:"patient-more",patient}, event.currentTarget)} aria-label={`Más opciones para ${patient.displayName}`}>Más</button> : null}</div></article>) : <div className="home-empty directory-empty"><h3>No hay pacientes para este filtro</h3><p>Probá con otro estado o quitá el texto de búsqueda.</p></div>}</div></section> : null}

    {dialog?.kind === "create" ? <CreateOptions onClose={closeDialog} onSchedule={() => openDialog({ kind: "schedule", date: selectedDate })}/> : null}
    {dialog?.kind === "schedule" ? <ScheduleForm key={`${dialog.appointment?.id??dialog.patient?.id??dialog.date??"new"}`} patients={data.patients} state={dialog} onClose={closeDialog}/> : null}
    {dialog?.kind === "close" ? <CloseForm key={`${dialog.operation}-${dialog.appointment.id}`} state={dialog} onClose={closeDialog}/> : null}
    {dialog?.kind === "actions" ? <AppointmentActions state={dialog} patient={data.patients.find((patient) => patient.id === dialog.appointment.patientId)} referenceNow={data.referenceNow} canNoShow={canMarkNoShow(dialog.appointment, data.referenceNow)} onStartUntimed={() => setDialog({kind:"start-untimed", appointment:dialog.appointment, patientName:dialog.patientName})} onSchedule={() => setDialog({kind:"schedule",appointment:dialog.appointment})} onCloseAppointment={(operation) => setDialog({kind:"close",appointment:dialog.appointment,operation})} onClose={closeDialog}/> : null}
    {dialog?.kind === "start-untimed" ? <ConfirmUntimedStart state={dialog} onClose={closeDialog}/> : null}
    {dialog?.kind === "patient-more" ? <PatientMoreOptions patient={dialog.patient} onClose={closeDialog}/> : null}
  </main>;
}
