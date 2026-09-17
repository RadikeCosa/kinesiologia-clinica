"use client";

import { useMemo, useState } from "react";
import {
  clinicalHomeScenarios,
  getClinicalHomeScenario,
} from "@/features/clinical-home/clinical-home.scenarios";
import {
  filterDirectory,
  formatFriendlyDateTime,
  presentToday,
} from "@/features/clinical-home/clinical-home.presenter";
import type {
  ClinicalHomeScenario,
  HomePatientViewModel,
  PresentedTodayItem,
  TreatmentStatus,
} from "@/features/clinical-home/clinical-home.types";

type Tab = "today" | "patients";
type Overlay =
  | { kind: "picker" }
  | { kind: "context"; patient: HomePatientViewModel }
  | { kind: "contact"; patient: HomePatientViewModel }
  | { kind: "map"; patient: HomePatientViewModel }
  | { kind: "boundary"; title: string; message: string }
  | null;

const STATUS_LABEL: Record<TreatmentStatus, string> = {
  active: "Activo",
  paused: "Pausado",
  finished: "Finalizado",
};

function sessionProgress(patient: HomePatientViewModel, prospective = false) {
  const completed = patient.treatment.completedSessions + (prospective ? 1 : 0);
  return patient.treatment.totalSessions
    ? `${completed} de ${patient.treatment.totalSessions}`
    : `${completed} realizadas · Sin límite definido`;
}

function TodayCard({
  item,
  onPrimary,
  onContact,
  onMap,
}: {
  item: PresentedTodayItem;
  onPrimary: () => void;
  onContact: () => void;
  onMap: () => void;
}) {
  const compact = item.displayState === "completed";
  const currentSession = ["upcoming", "past-unresolved", "scheduled-no-time", "in-progress", "documentation-pending", "sync-pending", "sync-error"].includes(item.displayState);
  return (
    <article className={`home-card today-card state-${item.displayState}${compact ? " is-compact" : ""}`}>
      <div className="today-time">{item.scheduledTime ?? "Sin hora"}</div>
      <div className="home-card-body">
        <div className="home-card-heading">
          <div>
            <h3>{item.patient.displayName}</h3>
            <p className="treatment-progress">
              {currentSession ? "Sesión: " : "Sesiones: "}{sessionProgress(item.patient, currentSession)}
            </p>
          </div>
          <span className="home-status">{item.statusLabel}</span>
        </div>

        {item.actualStart ? <p className="home-detail">Inicio real: {item.actualStart}{item.actualEnd ? ` · Finalizó: ${item.actualEnd}` : ""}</p> : null}
        {item.displayState === "past-unresolved" ? <p className="home-attention">El horario acordado pasó; la visita puede comenzar ahora o registrarse si ya se realizó.</p> : null}
        {item.displayState === "documentation-pending" ? <p className="home-attention">La atención terminó; falta confirmar la evolución.</p> : null}
        {item.displayState === "sync-pending" ? <p className="home-attention">Guardada en el dispositivo; falta sincronizar.</p> : null}
        {item.displayState === "sync-error" ? <p className="home-attention">No se pudo sincronizar. El registro sigue guardado en el dispositivo.</p> : null}
        {item.rescheduledLabel ? <p className="home-detail">Nuevo horario: {item.rescheduledLabel}</p> : null}
        {item.cancellationReason ? <p className="home-detail">{item.cancellationReason}</p> : null}

        {!compact && item.patient.address ? <p className="home-address">{item.patient.address}</p> : null}
        {!compact && item.patient.precautions?.length ? <p className="home-flag">Precauciones registradas</p> : null}
        {!compact && item.patient.accessInstructions ? <p className="home-flag">Tiene indicaciones para ingresar</p> : null}
        {currentSession && item.patient.treatment.totalSessions === item.patient.treatment.completedSessions + 1 ? <p className="home-attention">Última sesión del alcance actual.</p> : null}

        <div className="home-actions">
          <button className="home-primary-action" type="button" onClick={onPrimary}>{item.primaryActionLabel}</button>
          {!compact && item.patient.address ? <button type="button" onClick={onMap}>Cómo llegar</button> : null}
          {!compact && item.patient.phone ? <button type="button" onClick={onContact}>Contactar</button> : null}
        </div>
      </div>
    </article>
  );
}

function PatientCard({
  patient,
  onRegister,
  onContact,
  onMap,
  onOpen,
}: {
  patient: HomePatientViewModel;
  onRegister: () => void;
  onContact: () => void;
  onMap: () => void;
  onOpen: () => void;
}) {
  return <article className="home-card directory-card">
    <div className="home-card-heading">
      <div><h3>{patient.displayName}</h3><span className={`treatment-state treatment-${patient.treatment.status}`}>{STATUS_LABEL[patient.treatment.status]}</span></div>
      <p className="session-counter">{sessionProgress(patient)}</p>
    </div>
    <dl className="patient-facts">
      <div><dt>Dirección</dt><dd>{patient.address ?? "Sin dirección registrada"}</dd></div>
      <div><dt>Teléfono</dt><dd>{patient.phone ?? "Sin teléfono registrado"}</dd></div>
      <div><dt>Frecuencia</dt><dd>{patient.treatment.frequency ?? "Sin frecuencia registrada"}</dd></div>
      {patient.treatment.nextVisit ? <div><dt>Próxima visita</dt><dd>{formatFriendlyDateTime(patient.treatment.nextVisit.date, patient.treatment.nextVisit.time)}</dd></div> : null}
    </dl>
    <div className="home-actions">
      {patient.treatment.status === "active" ? <button className="home-primary-action" type="button" onClick={onRegister}>Registrar visita</button> : null}
      <button type="button" onClick={onOpen}>Ver paciente</button>
      {patient.address ? <button type="button" onClick={onMap}>Mapa</button> : null}
      {patient.phone ? <button type="button" onClick={onContact}>Contactar</button> : null}
    </div>
  </article>;
}

export function ClinicalHomeLab({ initialScenarioId }: { initialScenarioId: string }) {
  const [scenario, setScenario] = useState<ClinicalHomeScenario>(() => getClinicalHomeScenario(initialScenarioId));
  const [tab, setTab] = useState<Tab>("today");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<TreatmentStatus | "all">("active");
  const [overlay, setOverlay] = useState<Overlay>(null);
  const today = useMemo(() => presentToday(scenario), [scenario]);
  const directory = useMemo(() => filterDirectory(scenario.patients, query, filter), [scenario.patients, query, filter]);

  function chooseScenario(id: string) {
    const next = getClinicalHomeScenario(id);
    setScenario({ ...next, todayItems: [...next.todayItems] });
    setOverlay(null);
    window.history.replaceState(null, "", `/laboratorio/inicio?scenario=${encodeURIComponent(next.id)}`);
  }

  function openPrimary(item: PresentedTodayItem) {
    if (["upcoming", "past-unresolved", "scheduled-no-time"].includes(item.displayState)) {
      setOverlay({ kind: "context", patient: item.patient });
      return;
    }
    setOverlay({ kind: "boundary", title: item.primaryActionLabel, message: "Este estado está representado para revisar la pantalla. El laboratorio acordado no continúa el flujo clínico." });
  }

  function startVisit(patient: HomePatientViewModel) {
    const date = scenario.referenceNow.slice(0, 10);
    const time = scenario.referenceNow.slice(11, 16);
    const existing = scenario.todayItems.find((item) => item.patientId === patient.id && item.date === date && item.sourceState === "scheduled");
    setScenario((current) => ({
      ...current,
      todayItems: existing
        ? current.todayItems.map((item) => item.id === existing.id ? { ...item, sourceState: "in-progress", actualStart: time } : item)
        : [...current.todayItems, { id: `simulated-${patient.id}`, patientId: patient.id, date, scheduledTime: time, sourceState: "in-progress", actualStart: time }],
    }));
    setTab("today");
    setOverlay(null);
  }

  function showBoundary(title: string, message: string) { setOverlay({ kind: "boundary", title, message }); }

  const sections = [
    { title: "Pendientes anteriores", items: today.previousPending },
    { title: "Horarios de hoy", items: today.timed },
    { title: "Sin horario definido", items: today.withoutTime },
    { title: "Actualizaciones de hoy", items: today.changes },
  ].filter((section) => section.items.length);

  return <main className="home-lab-shell">
    <div className="lab-banner"><strong>Laboratorio de interfaz</strong><span>Datos ficticios · Sin persistencia · Hora fija 10:30</span></div>
    <header className="home-header">
      <div><p className="eyebrow">Kinesiología Clínica</p><h1>{tab === "today" ? "Hoy" : "Pacientes"}</h1><p>{tab === "today" ? "Martes 15 de septiembre" : "Directorio completo"}</p></div>
      <label className="scenario-picker">Escenario<select value={scenario.id} onChange={(event) => chooseScenario(event.target.value)}>{clinicalHomeScenarios.map((item) => <option value={item.id} key={item.id}>{item.title}</option>)}</select></label>
    </header>
    <p className="scenario-description">{scenario.description}</p>

    <div className="home-toolbar">
      <button className="home-primary-action" type="button" onClick={() => setOverlay({ kind: "picker" })}>Registrar visita</button>
    </div>

    <nav className="home-tabs" aria-label="Vista principal">
      <button type="button" aria-current={tab === "today" ? "page" : undefined} onClick={() => setTab("today")}>Hoy</button>
      <button type="button" aria-current={tab === "patients" ? "page" : undefined} onClick={() => setTab("patients")}>Pacientes</button>
    </nav>

    {tab === "today" ? <section className="home-view" aria-labelledby="today-heading">
      <div className="home-view-heading"><h2 id="today-heading">Agenda del día</h2><p>{today.summary.completed} finalizada{today.summary.completed === 1 ? "" : "s"} · {today.summary.pending} pendiente{today.summary.pending === 1 ? "" : "s"} · {today.summary.upcoming} próxima{today.summary.upcoming === 1 ? "" : "s"}</p></div>
      {sections.length ? sections.map((section) => <section className="today-section" key={section.title}><h3>{section.title}</h3><div className="today-list">{section.items.map((item) => <TodayCard key={item.id} item={item} onPrimary={() => openPrimary(item)} onContact={() => setOverlay({ kind: "contact", patient: item.patient })} onMap={() => setOverlay({ kind: "map", patient: item.patient })} />)}</div></section>) : <div className="home-empty"><h3>No hay visitas previstas para hoy</h3><p>El directorio de pacientes sigue disponible para registrar una visita no programada.</p></div>}
    </section> : <section className="home-view" aria-labelledby="directory-heading">
      <div className="home-view-heading"><h2 id="directory-heading">Pacientes</h2><p>{directory.length} resultado{directory.length === 1 ? "" : "s"}</p></div>
      <label className="directory-search">Buscar por nombre, teléfono o dirección<input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar paciente…" /></label>
      <div className="directory-filters" aria-label="Filtrar tratamientos">{(["active", "paused", "finished", "all"] as const).map((status) => <button type="button" aria-pressed={filter === status} onClick={() => setFilter(status)} key={status}>{status === "all" ? "Todos" : STATUS_LABEL[status]}</button>)}</div>
      <div className="directory-list">{directory.map((patient) => <PatientCard key={patient.id} patient={patient} onRegister={() => setOverlay({ kind: "context", patient })} onContact={() => setOverlay({ kind: "contact", patient })} onMap={() => setOverlay({ kind: "map", patient })} onOpen={() => showBoundary("Ver paciente", "La ficha clínica real queda fuera de este laboratorio de la pantalla inicial.")} />)}</div>
      {!directory.length ? <div className="home-empty"><h3>No encontramos pacientes</h3><p>Probá con otra búsqueda o filtro.</p></div> : null}
    </section>}

    {overlay ? <div className="lab-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setOverlay(null); }}><section className="lab-dialog" role="dialog" aria-modal="true" aria-labelledby="lab-dialog-title">
      <button className="dialog-close" type="button" onClick={() => setOverlay(null)} aria-label="Cerrar">×</button>
      {overlay.kind === "picker" ? <><p className="eyebrow">Registrar visita</p><h2 id="lab-dialog-title">Elegí un paciente activo</h2><div className="patient-picker-list">{scenario.patients.filter((patient) => patient.treatment.status === "active").map((patient) => <button type="button" key={patient.id} onClick={() => setOverlay({ kind: "context", patient })}><strong>{patient.displayName}</strong><span>{sessionProgress(patient, true)}</span></button>)}</div></> : null}
      {overlay.kind === "context" ? <><p className="eyebrow">Antes de comenzar</p><h2 id="lab-dialog-title">{overlay.patient.displayName}</h2><p>{overlay.patient.treatment.nextVisit ? formatFriendlyDateTime(overlay.patient.treatment.nextVisit.date, overlay.patient.treatment.nextVisit.time) : "Visita no programada"} · Sesión prevista {sessionProgress(overlay.patient, true)}</p>{overlay.patient.precautions?.length ? <div className="context-alert"><strong>Precauciones</strong><ul>{overlay.patient.precautions.map((item) => <li key={item}>{item}</li>)}</ul></div> : null}{overlay.patient.accessInstructions ? <div className="context-block"><strong>Indicaciones para ingresar</strong><p>{overlay.patient.accessInstructions}</p></div> : null}{overlay.patient.latestPlan ? <div className="context-block"><strong>Continuidad desde la última visita</strong><p>{overlay.patient.lastVisitLabel}</p><p>{overlay.patient.latestPlan}</p></div> : null}<div className="dialog-actions"><button className="home-primary-action" type="button" onClick={() => startVisit(overlay.patient)}>Comenzar visita ahora</button><button type="button" onClick={() => showBoundary("Carga diferida", "El acceso para registrar una visita ya realizada queda visible, pero su formulario no forma parte de este laboratorio.")}>Registrar una visita realizada</button></div></> : null}
      {overlay.kind === "contact" ? <><p className="eyebrow">Contacto simulado</p><h2 id="lab-dialog-title">{overlay.patient.displayName}</h2><p>{overlay.patient.phone}</p><div className="dialog-actions"><button type="button" onClick={() => showBoundary("Llamar", "En la aplicación conectada, esta acción abrirá el teléfono. El laboratorio no realiza llamadas.")}>Llamar</button><button type="button" onClick={() => showBoundary("WhatsApp", "En la aplicación conectada, esta acción abrirá WhatsApp. El laboratorio no envía mensajes.")}>Enviar WhatsApp</button></div></> : null}
      {overlay.kind === "map" ? <><p className="eyebrow">Ubicación simulada</p><h2 id="lab-dialog-title">Cómo llegar</h2><p>{overlay.patient.address}</p><p>En la aplicación conectada esta acción abrirá el mapa. El laboratorio no comparte direcciones con servicios externos.</p></> : null}
      {overlay.kind === "boundary" ? <><p className="eyebrow">Límite de la simulación</p><h2 id="lab-dialog-title">{overlay.title}</h2><p>{overlay.message}</p><button className="home-primary-action" type="button" onClick={() => setOverlay(null)}>Entendido</button></> : null}
    </section></div> : null}
  </main>;
}
