import Link from "next/link";
import { notFound } from "next/navigation";
import { getPatientContext } from "@/application/patients/get-patient-context";
import { requireClinicalSession } from "@/infrastructure/auth/auth-http";
import { createClinicalDependencies } from "@/infrastructure/fhir/create-clinical-dependencies";
import { canRenderLocalClinicalSurface } from "@/infrastructure/runtime/local-clinical-surface";
import { formatClinicalDateTime } from "../format-clinical-date-time";

export const dynamic = "force-dynamic";

const TIME_ZONE = "America/Argentina/Buenos_Aires";

function todayInBuenosAires() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

function formatScheduledDate(date: string, startsAt?: string) {
  if (startsAt) return formatClinicalDateTime(startsAt);
  const parsed = new Date(`${date}T12:00:00Z`);
  return `${new Intl.DateTimeFormat("es-AR", { timeZone: "UTC", day: "2-digit", month: "2-digit", year: "numeric" }).format(parsed)} · Sin horario`;
}

export default async function PatientPage({ params }: { params: Promise<{ id: string }> }) {
  if (!canRenderLocalClinicalSurface()) notFound();
  await requireClinicalSession();
  const { id } = await params;
  const dependencies = createClinicalDependencies();
  const context = await getPatientContext(id, dependencies);
  if (!context) notFound();

  const [allVisits, appointments, allEvaluations] = await Promise.all([
    dependencies.visits.listByPatientId(id),
    dependencies.scheduledVisits.listByPatientId(id),
    dependencies.evaluations.listByPatientId(id),
  ]);
  const visits = allVisits.filter((visit) => visit.status !== "entered-in-error" && visit.treatmentId === context.treatment.id);
  const finishedVisits = visits.filter((visit) => visit.status === "finished");
  const activeVisit = visits.find((visit) => visit.status === "in-progress");
  const today = todayInBuenosAires();
  const openAppointments = appointments
    .filter((appointment) => appointment.treatmentId === context.treatment.id && ["booked", "proposed"].includes(appointment.status))
    .sort((first, second) => `${first.scheduledDate}${first.startsAt ?? "99:99"}`.localeCompare(`${second.scheduledDate}${second.startsAt ?? "99:99"}`));
  const overdueCount = openAppointments.filter((appointment) => appointment.scheduledDate < today).length;
  const nextAppointment = openAppointments.find((appointment) => appointment.scheduledDate >= today);
  const sessionProgress = context.treatment.plannedSessionCount
    ? `${finishedVisits.length} de ${context.treatment.plannedSessionCount}`
    : `${finishedVisits.length} realizadas`;
  const phoneHref = context.patient.phone ? `tel:${context.patient.phone.replace(/[^+\d]/g, "")}` : undefined;
  const whatsappHref = context.patient.phone ? `https://wa.me/${context.patient.phone.replace(/\D/g, "")}` : undefined;
  const mapHref = context.patient.address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(context.patient.address)}` : undefined;
  const treatmentVisitIds = new Set(visits.map((visit) => visit.id));
  const evaluationSeries = Array.from(allEvaluations.filter((item) => treatmentVisitIds.has(item.visitId)).reduce((groups, item) => {
    const group = groups.get(item.seriesId) ?? []; group.push(item); groups.set(item.seriesId, group); return groups;
  }, new Map<string, typeof allEvaluations>()));

  return <main className="shell clinical-shell patient-detail-shell">
    <Link className="back-link" href="/inicio?vista=pacientes">Volver a pacientes</Link>
    <div className="patient-detail-heading">
      <div><p className="eyebrow">Entorno local · Datos ficticios</p><h1>{context.patient.givenName} {context.patient.familyName}</h1><p className="lede">Tratamiento activo desde {context.treatment.startDate}</p></div>
      <div className="patient-detail-actions"><Link className="primary-link" href={`/patients/${encodeURIComponent(id)}/visits/new`}>Registrar visita</Link><Link className="diagnostic-link" href={`/inicio?vista=agenda&agendar=${encodeURIComponent(id)}`}>Agendar visita</Link>{evaluationSeries.length ? <Link className="diagnostic-link" href="#evaluation-history">Ver evaluaciones</Link> : null}</div>
    </div>

    <section className="patient-summary" aria-label="Resumen del paciente">
      <div><span>Tratamiento</span><strong>Activo</strong></div>
      <div><span>Sesiones</span><strong>{sessionProgress}</strong></div>
      <div><span>Frecuencia prevista</span><strong>{context.treatment.plannedFrequency || "Sin registrar"}</strong></div>
      <div><span>Próxima visita</span><strong>{nextAppointment ? formatScheduledDate(nextAppointment.scheduledDate, nextAppointment.startsAt) : "Sin agendar"}</strong></div>
      {overdueCount ? <p className="patient-pending-note">{overdueCount} {overdueCount === 1 ? "visita pendiente anterior" : "visitas pendientes anteriores"}</p> : null}
    </section>

    <div className="clinical-grid patient-detail-grid">
      <section className="clinical-panel patient-contact-panel">
        <h2>Contacto y domicilio</h2>
        <dl className="context-list compact-context-list">
          <div><dt>Teléfono</dt><dd>{context.patient.phone || "Sin registrar"}</dd></div>
          <div><dt>Dirección</dt><dd>{context.patient.address || "Sin registrar"}</dd></div>
          <div><dt>Indicaciones para llegar</dt><dd>{context.patient.accessInstructions || "Sin registrar"}</dd></div>
        </dl>
        <div className="patient-contact-actions">{phoneHref ? <a className="button-link" href={phoneHref}>Llamar</a> : null}{whatsappHref ? <a className="button-link" href={whatsappHref} target="_blank" rel="noreferrer">WhatsApp</a> : null}{mapHref ? <a className="button-link" href={mapHref} target="_blank" rel="noreferrer">Mapa</a> : null}</div>
      </section>

      <section className="clinical-panel patient-context-panel">
        <h2>Contexto del tratamiento</h2>
        <dl className="context-list">
          <div><dt>Situación inicial</dt><dd>{context.treatment.clinicalContext?.initialFunctionalStatus || "Sin registrar"}</dd></div>
          <div><dt>Objetivos</dt><dd>{context.treatment.clinicalContext?.therapeuticGoals || "Sin registrar"}</dd></div>
          <div><dt>Plan general</dt><dd>{context.treatment.clinicalContext?.frameworkPlan || "Sin registrar"}</dd></div>
          <div><dt>Precauciones</dt><dd>{context.treatment.precautions?.join(" · ") || "Sin registrar"}</dd></div>
        </dl>
        <div className="patient-diagnoses"><h3>Diagnósticos</h3>{context.diagnoses.length ? <ul>{context.diagnoses.map((diagnosis) => <li key={diagnosis.id}><span>{diagnosis.kind === "medical_reference" ? "De referencia" : "Kinésico"}</span>{diagnosis.text}</li>)}</ul> : <p>Sin diagnósticos vinculados.</p>}</div>
      </section>

      <section className="clinical-panel patient-visits-panel">
        <div className="patient-panel-heading"><div><h2>Visitas</h2><p>{finishedVisits.length} registradas en este tratamiento</p></div>{activeVisit ? <Link className="primary-link" href={`/patients/${encodeURIComponent(id)}/visits/${encodeURIComponent(activeVisit.id)}/edit`}>Continuar visita</Link> : null}</div>
        {visits.length ? <ul className="visit-list patient-visit-list">{visits.slice(0, 6).map((visit) => <li key={visit.id}><div><Link href={`/patients/${encodeURIComponent(id)}/visits/${encodeURIComponent(visit.id)}`}>{formatClinicalDateTime(visit.startedAt)}</Link><span>{visit.status === "finished" ? "Finalizada" : "En curso"}</span></div>{(visit.clinicalNote?.statusAndResponse || visit.clinicalNote?.assessment) ? <p>{visit.clinicalNote?.statusAndResponse || visit.clinicalNote?.assessment}</p> : null}{visit.clinicalNote?.nextPlan ? <small>Próximo plan: {visit.clinicalNote.nextPlan}</small> : null}<Link className="visit-record-link" href={`/patients/${encodeURIComponent(id)}/visits/${encodeURIComponent(visit.id)}`}>{visit.status === "finished" ? "Ver registro completo" : "Continuar registro"}</Link></li>)}</ul> : <p>Todavía no hay visitas registradas.</p>}
      </section>
      <section className="clinical-panel patient-evaluations-panel" id="evaluation-history">
        <p className="eyebrow">Seguimiento longitudinal</p><h2>Evolución de evaluaciones</h2><p className="panel-introduction">Cada bloque reúne los registros de una misma evaluación a lo largo del tratamiento.</p>
        {evaluationSeries.length ? <div className="evaluation-series-list">{evaluationSeries.map(([seriesId, entries]) => <article id={`evaluation-series-${seriesId}`} key={seriesId}><h3>{entries[0]?.name}</h3><ol>{entries.sort((a, b) => a.effectiveDateTime.localeCompare(b.effectiveDateTime)).map((item) => <li key={item.id}><Link href={`/patients/${encodeURIComponent(id)}/visits/${encodeURIComponent(item.visitId)}`}>{formatClinicalDateTime(item.effectiveDateTime)}</Link><span>{item.result.kind === "quantity" ? `${item.result.value} ${item.result.unit ?? ""}` : item.result.kind === "boolean" ? item.result.value ? "Sí" : "No" : item.result.kind === "absent" ? `No realizado · ${item.result.reason}` : item.result.value}</span>{item.context?.bodySite || item.context?.laterality ? <small>{[item.context.bodySite, item.context.laterality].filter(Boolean).join(" · ")}</small> : null}</li>)}</ol></article>)}</div> : <p>Todavía no hay evaluaciones registradas.</p>}
      </section>
    </div>
    <p className="clinical-footnote">Vista temporal de prueba. Solo se permite usar datos ficticios de 8081.</p>
  </main>;
}
