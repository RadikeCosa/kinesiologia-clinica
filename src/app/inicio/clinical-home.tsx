"use client";

import Link from "next/link";
import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { filterDirectory, formatFriendlyDate, formatFriendlyDateTime, getLocalDate, presentDay, presentWeek } from "@/features/clinical-home/clinical-home.presenter";
import type { AgendaItemViewModel, ClinicalHomeData, HomePatientViewModel, PresentedTodayItem, TreatmentStatus } from "@/features/clinical-home/clinical-home.types";
import { beginVisit, changeAppointment, saveAppointment, type HomeActionState } from "./actions";

type Tab = "today" | "agenda" | "patients";
type DialogState =
  | { kind: "schedule"; patient?: HomePatientViewModel; appointment?: AgendaItemViewModel; date?: string }
  | { kind: "close"; appointment: AgendaItemViewModel; operation: "cancelled" | "no-show" }
  | { kind: "actions"; appointment: AgendaItemViewModel; patientName: string }
  | { kind: "start-untimed"; appointment: AgendaItemViewModel; patientName: string }
  | { kind: "contact"; patient: HomePatientViewModel }
  | { kind: "location"; patient: HomePatientViewModel }
  | null;

const STATUS: Record<TreatmentStatus, string> = { active: "Activo", paused: "Pausado", finished: "Finalizado" };
const REASONS = [["patient-or-family", "Paciente o familia"], ["professional", "Profesional"], ["health-event", "Situación de salud"], ["logistics-or-weather", "Logística o clima"], ["other", "Otro"]] as const;
const initialHomeActionState: HomeActionState = { error: null };

function progress(patient: HomePatientViewModel, add = 0) {
  const done = patient.treatment.completedSessions + add;
  return patient.treatment.totalSessions ? `${done} de ${patient.treatment.totalSessions}` : `${done} realizadas`;
}

function visitProgress(patient: HomePatientViewModel, currentSession: boolean) {
  const completed = patient.treatment.completedSessions;
  if (currentSession) return patient.treatment.totalSessions ? `Sesión ${completed + 1} de ${patient.treatment.totalSessions}` : `Próxima sesión: ${completed + 1}`;
  return patient.treatment.totalSessions ? `Sesiones ${completed} de ${patient.treatment.totalSessions}` : `${completed} realizadas`;
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

function BeginVisitForm({ patientId, treatmentId, appointmentId, label }: { patientId: string; treatmentId?: string; appointmentId?: string; label: string }) {
  const [clientVisitId] = useState(() => crypto.randomUUID());
  if (!treatmentId) return null;
  return <form action={beginVisit}><input type="hidden" name="clientVisitId" value={clientVisitId}/><input type="hidden" name="patientId" value={patientId}/><input type="hidden" name="treatmentId" value={treatmentId}/>{appointmentId ? <input type="hidden" name="appointmentId" value={appointmentId}/> : null}<button className="home-primary-action">{label}</button></form>;
}

function AccessibleDialog({ title, onClose, className = "", children }: { title: string; onClose: () => void; className?: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { ref.current?.showModal(); }, []);
  return <dialog ref={ref} className={`home-dialog ${className}`} onClose={onClose} aria-labelledby="home-dialog-title">
    <button className="dialog-close" type="button" onClick={() => ref.current?.close()} aria-label="Cerrar">×</button>
    <h2 id="home-dialog-title">{title}</h2>{children}
  </dialog>;
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

function AppointmentActions({ state, referenceNow, canNoShow, onStartUntimed, onSchedule, onCloseAppointment, onClose }: { state: Exclude<DialogState, null> & { kind: "actions" }; referenceNow: string; canNoShow: boolean; onStartUntimed: () => void; onSchedule: () => void; onCloseAppointment: (operation: "cancelled" | "no-show") => void; onClose: () => void }) {
  const canRegister = state.appointment.scheduledDate <= getLocalDate(referenceNow);
  return <AccessibleDialog title="Opciones de la visita" className="home-action-sheet" onClose={onClose}>
    <p className="action-sheet-context"><strong>{state.patientName}</strong><br/>{formatFriendlyDateTime(state.appointment.scheduledDate, state.appointment.scheduledTime)}</p>
    <div className="action-sheet-list">
      {canRegister && state.appointment.status === "booked" ? <BeginVisitForm patientId={state.appointment.patientId} treatmentId={state.appointment.treatmentId} appointmentId={state.appointment.id} label="Comenzar visita"/> : null}
      {canRegister && state.appointment.status === "proposed" ? <button type="button" onClick={onStartUntimed}>Comenzar visita</button> : null}
      {canRegister ? <Link href={`/patients/${state.appointment.patientId}/visits/new?cita=${state.appointment.id}&modo=diferida`}>Registrar visita ya realizada</Link> : null}
      <button type="button" onClick={onSchedule}>Reprogramar</button><button type="button" onClick={() => onCloseAppointment("cancelled")}>Cancelar visita</button>{canNoShow ? <button type="button" onClick={() => onCloseAppointment("no-show")}>No se realizó</button> : null}
    </div>
  </AccessibleDialog>;
}

function ContactOptions({ patient, onClose }: { patient: HomePatientViewModel; onClose: () => void }) {
  return <AccessibleDialog title="Contacto" className="home-action-sheet" onClose={onClose}><p className="action-sheet-context"><strong>{patient.displayName}</strong><br/>{patient.phone}</p><div className="action-sheet-list"><a href={`tel:${patient.phone}`}>Llamar</a><a href={`https://wa.me/${patient.phone?.replace(/\D/g, "")}`}>Enviar mensaje por WhatsApp</a></div></AccessibleDialog>;
}

function LocationOptions({ patient, onClose }: { patient: HomePatientViewModel; onClose: () => void }) {
  return <AccessibleDialog title="Cómo llegar" className="home-action-sheet" onClose={onClose}><p className="action-sheet-context"><strong>{patient.displayName}</strong><br/>{patient.address}</p>{patient.accessInstructions ? <div className="location-instructions"><strong>Indicaciones para llegar</strong><p>{patient.accessInstructions}</p></div> : null}<div className="action-sheet-list"><a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(patient.address ?? "")}`} target="_blank" rel="noreferrer">Ver mapa</a></div></AccessibleDialog>;
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

function VisitCard({ item, appointment, referenceNow, selectedIsToday, onDialog }: { item: PresentedTodayItem; appointment?: AgendaItemViewModel; referenceNow: string; selectedIsToday: boolean; onDialog: (dialog: Exclude<DialogState, null>, trigger: HTMLElement) => void }) {
  const future = item.date > getLocalDate(referenceNow);
  const currentSession = !["completed", "rescheduled", "cancelled", "no-show"].includes(item.displayState);
  return <article className={`home-card visit-card state-${item.displayState}`}>
    <div className="visit-card-top"><strong className="visit-time">{item.scheduledTime ? `${item.scheduledTime} hs` : "Sin horario"}</strong><span className="home-status">{item.statusLabel}</span></div>
    <div className="visit-card-main"><h3><Link className="patient-name-link" href={`/patients/${item.patientId}`}>{item.patient.displayName}</Link></h3><p className="treatment-progress">{visitProgress(item.patient, currentSession)}</p></div>
    {item.patient.phone || item.patient.address ? <div className="visit-contact-details">{item.patient.phone ? <button type="button" onClick={(event) => onDialog({kind:"contact", patient:item.patient}, event.currentTarget)}><span>Teléfono</span>{item.patient.phone}</button> : null}{item.patient.address ? <button type="button" onClick={(event) => onDialog({kind:"location", patient:item.patient}, event.currentTarget)}><span>Dirección</span>{item.patient.address}</button> : null}</div> : null}
    {item.actualStart ? <p className="home-detail">Inicio real {item.actualStart}{item.actualEnd ? ` · Finalizó ${item.actualEnd}` : ""}</p> : null}
    <div className="visit-actions">
      <div className="visit-clinical-actions">
        {item.displayState === "in-progress" && item.visitId ? <Link className="home-primary-action button-link" href={`/patients/${item.patientId}/visits/${item.visitId}/edit`}>Continuar</Link> : null}
        {appointment?.status === "booked" && item.displayState === "past-unresolved" ? <button className="home-primary-action" type="button" onClick={(event) => onDialog({kind:"actions", appointment, patientName:item.patient.displayName}, event.currentTarget)}>Resolver visita</button> : null}
        {appointment?.status === "booked" && item.displayState === "upcoming" && selectedIsToday ? <BeginVisitForm patientId={item.patientId} treatmentId={item.treatmentId} appointmentId={item.id} label="Comenzar visita"/> : null}
        {appointment?.status === "proposed" && !future ? <button className="home-primary-action" type="button" onClick={(event) => onDialog({ kind: "start-untimed", appointment, patientName: item.patient.displayName }, event.currentTarget)}>Comenzar visita</button> : null}
        {appointment?.status === "proposed" && future ? <button className="home-primary-action" type="button" onClick={(event) => onDialog({ kind: "schedule", appointment }, event.currentTarget)}>Definir horario</button> : null}
        {future && item.displayState === "upcoming" ? <Link className="button-link" href={`/patients/${item.patientId}`}>Ver paciente</Link> : null}
      </div>
      <div className="visit-utility-actions">
        {appointment && ["booked", "proposed"].includes(appointment.status) && item.displayState !== "past-unresolved" ? <button type="button" className="more-action" onClick={(event) => onDialog({ kind: "actions", appointment, patientName: item.patient.displayName }, event.currentTarget)} aria-label={`Más opciones para ${item.patient.displayName}`}>Más</button> : null}
      </div>
    </div>
  </article>;
}

function compactDate(date: string) {
  const [, month, day] = date.split("-");
  return `${day}/${month}`;
}

function HistoryRows({ items, showOriginalDate = false }: { items: PresentedTodayItem[]; showOriginalDate?: boolean }) {
  return <div className={`history-list${showOriginalDate ? " history-list-with-date" : ""}`}>{items.map((item) => <div className="history-row" key={item.id}><span>{showOriginalDate ? `${compactDate(item.date)} · ` : ""}{item.scheduledTime ? `${item.scheduledTime} hs` : "Sin horario"}</span><strong><Link href={`/patients/${item.patientId}`}>{item.patient.displayName}</Link></strong><span>{item.statusLabel}</span>{item.visitId && item.displayState === "completed" ? <Link className="history-detail-link" href={`/patients/${item.patientId}/visits/${item.visitId}`}>Ver registro completo</Link> : null}</div>)}</div>;
}

export function ClinicalHome({ data, initialTab = "today", initialPatientId, initialSelectedDate }: { data: ClinicalHomeData; initialTab?: Tab; initialPatientId?: string; initialSelectedDate?: string }) {
  const week = useMemo(() => presentWeek(data.referenceNow, data.dayItems), [data]);
  const validInitialDate = week.some((day) => day.date === initialSelectedDate) ? initialSelectedDate! : week[0].date;
  const today = getLocalDate(data.referenceNow);
  const initialAgendaDate = initialSelectedDate && initialSelectedDate >= data.agendaFrom && initialSelectedDate <= data.agendaTo
    ? initialSelectedDate
    : today >= data.agendaFrom && today <= data.agendaTo ? today : data.agendaFrom;
  const [selectedDate, setSelectedDate] = useState(validInitialDate);
  const [selectedAgendaDate, setSelectedAgendaDate] = useState(initialAgendaDate);
  const [tab, setTab] = useState<Tab>(initialTab);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<TreatmentStatus | "all">("active");
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const [dialog, setDialog] = useState<DialogState>(() => { const patient = data.patients.find((item) => item.id === initialPatientId); return patient ? { kind: "schedule", patient, date: validInitialDate } : null; });
  const day = useMemo(() => presentDay({ referenceNow: data.referenceNow, selectedDate, patients: data.patients, dayItems: data.dayItems }), [data, selectedDate]);
  const patients = useMemo(() => filterDirectory(data.patients, query, filter), [data.patients, query, filter]);
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
  const overdueAgendaItems = useMemo(() => data.agendaItems.filter((item) => item.scheduledDate < today && ["booked", "proposed"].includes(item.status)), [data.agendaItems, today]);

  function openDialog(next: Exclude<DialogState, null>, trigger?: HTMLElement) { if (trigger) returnFocusRef.current = trigger; setDialog(next); }
  function closeDialog() { setDialog(null); window.requestAnimationFrame(() => returnFocusRef.current?.focus()); }
  function selectTab(next: Tab) { setTab(next); const suffix = next === "today" ? `hoy&fecha=${selectedDate}` : next === "agenda" ? `agenda&mes=${data.agendaMonth}&fecha=${selectedAgendaDate}` : "pacientes"; window.history.replaceState(null, "", `/inicio?vista=${suffix}`); }
  function selectDate(date: string) { setSelectedDate(date); setTab("today"); window.history.replaceState(null, "", `/inicio?vista=hoy&fecha=${date}`); }
  function selectAgendaDate(date: string) { setSelectedAgendaDate(date); window.history.replaceState(null, "", `/inicio?vista=agenda&mes=${data.agendaMonth}&fecha=${date}`); }
  const heading = tab === "today" ? (day.isToday ? "Hoy" : new Intl.DateTimeFormat("es-AR", { weekday: "long", timeZone: "UTC" }).format(new Date(`${selectedDate}T12:00:00Z`))) : tab === "agenda" ? "Agenda" : "Pacientes";
  const selectedLabel = formatSelectedDate(selectedDate, day.isToday);
  const appointmentFor = (item: PresentedTodayItem) => appointmentFromItem(item, data.agendaItems.find((value) => value.id === item.id));
  const actionableCount = day.timed.length + day.withoutTime.length + day.previousPending.length + (day.activeVisit ? 1 : 0);
  useEffect(() => {
    if (initialTab === "today" && initialSelectedDate && initialSelectedDate !== validInitialDate) {
      window.history.replaceState(null, "", `/inicio?vista=hoy&fecha=${validInitialDate}`);
    }
  }, [initialSelectedDate, initialTab, validInitialDate]);
  return <main className="home-lab-shell clinical-home-real">
    <header className="operational-header"><div><p>{tab === "today" ? selectedLabel : "Kinesiología Clínica"}</p><h1>{heading.charAt(0).toUpperCase() + heading.slice(1)}</h1></div><button className="home-primary-action schedule-shortcut" onClick={(event) => openDialog({ kind: "schedule", date: selectedDate }, event.currentTarget)}>＋ Agendar</button></header>
    <nav className="home-tabs home-tabs-three" aria-label="Vista principal">{([["today","Hoy"],["agenda","Agenda"],["patients","Pacientes"]] as const).map(([value,label]) => <button key={value} type="button" aria-current={tab === value ? "page" : undefined} onClick={() => selectTab(value)}>{label}</button>)}</nav>

    {tab === "today" ? <section className="operational-day" aria-labelledby="day-heading">
      <div className="week-strip" aria-label="Próximos siete días">{week.map((weekDay) => <button type="button" key={weekDay.date} aria-label={weekDay.fullLabel} aria-pressed={selectedDate === weekDay.date} onClick={() => selectDate(weekDay.date)}><span>{weekDay.weekdayLabel}</span><strong>{weekDay.dayLabel}</strong><small>{weekDay.visitCount || "–"}</small></button>)}</div>
      <div className="day-heading"><p id="day-heading" aria-live="polite">{actionableCount} {actionableCount === 1 ? "visita por atender" : "visitas por atender"}</p></div>
      {day.activeVisit ? <section className="operational-section priority-section"><h3>Visita en curso</h3><VisitCard item={day.activeVisit} appointment={appointmentFor(day.activeVisit)} referenceNow={data.referenceNow} selectedIsToday={day.isToday} onDialog={openDialog}/></section> : null}
      {day.previousPending.length ? <section className="operational-section attention-section"><h3>Pendientes anteriores <span>{day.previousPending.length}</span></h3><div className="today-list">{day.previousPending.map((item) => <VisitCard key={item.id} item={item} appointment={appointmentFor(item)} referenceNow={data.referenceNow} selectedIsToday={day.isToday} onDialog={openDialog}/>)}</div></section> : null}
      {day.timed.length ? <section className="operational-section"><h3>{day.isToday ? "Horarios de hoy" : "Con horario"}</h3><div className="today-list">{day.timed.map((item) => <VisitCard key={item.id} item={item} appointment={appointmentFor(item)} referenceNow={data.referenceNow} selectedIsToday={day.isToday} onDialog={openDialog}/>)}</div></section> : null}
      {day.withoutTime.length ? <section className="operational-section"><h3>Sin horario definido</h3><div className="today-list">{day.withoutTime.map((item) => <VisitCard key={item.id} item={item} appointment={appointmentFor(item)} referenceNow={data.referenceNow} selectedIsToday={day.isToday} onDialog={openDialog}/>)}</div></section> : null}
      {!day.activeVisit && !day.previousPending.length && !day.timed.length && !day.withoutTime.length ? <div className="day-empty"><h3>No hay visitas previstas</h3><p>Podés agendar una visita directamente para este día.</p><button className="home-primary-action" onClick={(event) => openDialog({ kind: "schedule", date: selectedDate }, event.currentTarget)}>Agendar en este día</button></div> : null}
      {day.completed.length ? <details className="history-group"><summary>Realizadas <span>{day.completed.length}</span></summary><HistoryRows items={day.completed}/></details> : null}
      {day.changes.length ? <details className="history-group"><summary>Actualizaciones de hoy <span>{day.changes.length}</span></summary><HistoryRows items={day.changes} showOriginalDate/></details> : null}
    </section> : null}

    {tab === "agenda" ? <section className="home-view agenda-view">
      <div className="month-heading"><Link className="month-navigation" href={`/inicio?vista=agenda&mes=${shiftMonth(data.agendaMonth, -1)}&fecha=${shiftMonth(data.agendaMonth, -1)}-01`} aria-label="Mes anterior">‹</Link><div><h2>{formatMonth(data.agendaMonth)}</h2><Link href={`/inicio?vista=agenda&mes=${today.slice(0, 7)}&fecha=${today}`}>Ir a hoy</Link></div><Link className="month-navigation" href={`/inicio?vista=agenda&mes=${shiftMonth(data.agendaMonth, 1)}&fecha=${shiftMonth(data.agendaMonth, 1)}-01`} aria-label="Mes siguiente">›</Link></div>
      <div className="month-calendar" aria-label={`Calendario de ${formatMonth(data.agendaMonth)}`}>
        {(["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"] as const).map((label) => <span className="calendar-weekday" key={label}>{label}</span>)}
        {agendaDays.map((date, index) => date ? <button key={date} type="button" aria-label={`${formatFriendlyDate(date)}, ${agendaCounts.get(date) ?? 0} visitas`} aria-pressed={selectedAgendaDate === date} className={date === today ? "is-today" : undefined} onClick={() => selectAgendaDate(date)}><span>{Number(date.slice(-2))}</span>{agendaCounts.get(date) ? <small>{agendaCounts.get(date)}</small> : null}</button> : <span className="calendar-empty" key={`empty-${index}`}/>) }
      </div>
      {overdueAgendaItems.length ? <details className="history-group agenda-pending"><summary>Pendientes anteriores <span>{overdueAgendaItems.length}</span></summary><div className="agenda-pending-list">{overdueAgendaItems.map((item) => <div key={item.id}><span>{formatFriendlyDateTime(item.scheduledDate, item.scheduledTime)}</span><Link href={`/patients/${item.patientId}`}>{item.patientName}</Link></div>)}</div></details> : null}
      <section className="agenda-selected-day" aria-labelledby="agenda-selected-heading"><div className="agenda-day-heading"><div><p>Día seleccionado</p><h2 id="agenda-selected-heading">{formatFriendlyDate(selectedAgendaDate)}</h2></div><span aria-live="polite">{selectedAgendaItems.length} {selectedAgendaItems.length === 1 ? "visita" : "visitas"}</span></div>
        <div className="agenda-day-list">{selectedAgendaItems.map((item) => <article className="home-card agenda-card" key={item.id}><div className="agenda-card-time"><strong>{item.scheduledTime ? `${item.scheduledTime} hs` : "Sin horario"}</strong>{item.durationMinutes ? <span>{item.durationMinutes} min</span> : null}</div><div className="agenda-card-patient"><h3><Link className="patient-name-link" href={`/patients/${item.patientId}`}>{item.patientName}</Link></h3><span className="home-status">{item.statusLabel}</span></div>{["booked", "proposed"].includes(item.status) ? <button type="button" className="more-action agenda-more" onClick={(event) => openDialog({kind:"actions", appointment:item, patientName:item.patientName}, event.currentTarget)} aria-label={`Más opciones para ${item.patientName}`}>Más</button> : null}</article>)}</div>
        {!selectedAgendaItems.length ? <div className="day-empty"><h3>{selectedAgendaDate < today ? "No hubo visitas agendadas" : "No hay visitas previstas"}</h3>{selectedAgendaDate >= today ? <><p>Podés agendar una visita para este día.</p><button className="home-primary-action" onClick={(event) => openDialog({kind:"schedule", date:selectedAgendaDate}, event.currentTarget)}>Agendar en este día</button></> : <p>Podés consultar otro día desde el calendario.</p>}</div> : null}
      </section>
    </section> : null}

    {tab === "patients" ? <section className="home-view patients-view"><div className="directory-tools-heading"><label className="directory-search">Buscar por nombre, teléfono o dirección<input type="search" value={query} onChange={(event)=>setQuery(event.target.value)}/></label><p aria-live="polite">{patients.length} {patients.length === 1 ? "resultado" : "resultados"}</p></div><div className="directory-filters">{(["active","paused","finished","all"] as const).map((value)=><button key={value} aria-pressed={filter===value} onClick={()=>setFilter(value)}>{value==="all"?"Todos":STATUS[value]}</button>)}</div><div className="directory-list">{patients.map((patient)=><article className="home-card directory-card" key={patient.id}><div className="home-card-heading"><div><h3><Link className="patient-name-link" href={`/patients/${patient.id}`}>{patient.displayName}</Link></h3><span className={`treatment-state treatment-${patient.treatment.status}`}>{STATUS[patient.treatment.status]}</span></div><div className="patient-treatment-summary"><strong>{progress(patient)}</strong><span>{patient.treatment.frequency??"Frecuencia sin registrar"}</span></div></div>{patient.treatment.nextVisit?<p className="patient-next-visit"><span>Próxima visita</span>{formatFriendlyDateTime(patient.treatment.nextVisit.date, patient.treatment.nextVisit.time)}</p>:null}{patient.precautions?.length?<div className="patient-precautions"><strong>Precauciones</strong><span>{patient.precautions.join(" · ")}</span></div>:null}<dl className="patient-facts"><div className="patient-fact-wide patient-location-fact"><dt>Dirección</dt><dd>{patient.address??"Sin dirección registrada"}{patient.address?<a className="inline-text-action" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(patient.address)}`} target="_blank" rel="noreferrer">Ver mapa</a>:null}{patient.accessInstructions?<details className="access-instructions"><summary>Indicaciones para llegar</summary><p>{patient.accessInstructions}</p></details>:null}</dd></div><div className="patient-fact-wide"><dt>Teléfono</dt><dd>{patient.phone??"Sin teléfono registrado"}{patient.phone?<span className="inline-contact-actions"><a href={`tel:${patient.phone}`}>Llamar</a><a href={`https://wa.me/${patient.phone.replace(/\D/g,"")}`}>WhatsApp</a></span>:null}</dd></div></dl><div className="home-actions directory-primary-actions">{patient.treatment.status==="active"?<><button className="home-primary-action" onClick={(event)=>openDialog({kind:"schedule",patient,date:selectedDate}, event.currentTarget)}>Agendar visita</button><BeginVisitForm patientId={patient.id} treatmentId={patient.treatment.id} label="Comenzar visita"/></>:null}</div></article>)}</div></section> : null}

    {dialog?.kind === "schedule" ? <ScheduleForm key={`${dialog.appointment?.id??dialog.patient?.id??dialog.date??"new"}`} patients={data.patients} state={dialog} onClose={closeDialog}/> : null}
    {dialog?.kind === "close" ? <CloseForm key={`${dialog.operation}-${dialog.appointment.id}`} state={dialog} onClose={closeDialog}/> : null}
    {dialog?.kind === "actions" ? <AppointmentActions state={dialog} referenceNow={data.referenceNow} canNoShow={canMarkNoShow(dialog.appointment, data.referenceNow)} onStartUntimed={() => setDialog({kind:"start-untimed", appointment:dialog.appointment, patientName:dialog.patientName})} onSchedule={() => setDialog({kind:"schedule",appointment:dialog.appointment})} onCloseAppointment={(operation) => setDialog({kind:"close",appointment:dialog.appointment,operation})} onClose={closeDialog}/> : null}
    {dialog?.kind === "start-untimed" ? <ConfirmUntimedStart state={dialog} onClose={closeDialog}/> : null}
    {dialog?.kind === "contact" ? <ContactOptions patient={dialog.patient} onClose={closeDialog}/> : null}
    {dialog?.kind === "location" ? <LocationOptions patient={dialog.patient} onClose={closeDialog}/> : null}
  </main>;
}
