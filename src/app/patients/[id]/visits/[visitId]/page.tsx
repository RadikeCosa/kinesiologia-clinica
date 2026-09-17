import Link from "next/link";
import { notFound } from "next/navigation";
import { createClinicalDependencies } from "@/infrastructure/fhir/create-clinical-dependencies";
import { canRenderLocalClinicalSurface } from "@/infrastructure/runtime/local-clinical-surface";
import { formatClinicalDateTime } from "../../../format-clinical-date-time";
import { requireClinicalSession } from "@/infrastructure/auth/auth-http";
import { deriveDocumentationTimeliness, deriveStartPunctuality } from "@/domain/visit/visit-timeliness";
import type { ClinicalEvaluation, EvaluationAbsentReason, EvaluationDomain, ProcedureFamily } from "@/domain/visit/clinical-entry";

export const dynamic = "force-dynamic";

const DOMAIN_LABELS: Record<EvaluationDomain, string> = { "pain-symptoms": "Dolor y síntomas", "joint-mobility": "Movilidad articular", strength: "Fuerza", "gait-mobility": "Marcha y movilidad funcional", transfers: "Transferencias", "balance-falls": "Equilibrio y caídas", "respiratory-exertion": "Función respiratoria y tolerancia al esfuerzo", "environment-independence": "Entorno e independencia" };
const ABSENT_LABELS: Record<EvaluationAbsentReason, string> = { "not-relevant": "No pertinente", deferred: "Diferido", "not-tolerated": "No tolerado", "unsafe-contraindicated": "Inseguro o contraindicado", refused: "Rechazado" };
const PROCEDURE_LABELS: Record<ProcedureFamily, string> = { "therapeutic-exercise": "Ejercicio terapéutico", "manual-therapy": "Terapia manual", "gait-transfers": "Marcha y transferencias", respiratory: "Intervención respiratoria", "education-instructions": "Educación e indicaciones", "environment-assistive-devices": "Entorno y ayudas técnicas", other: "Otro" };
const LATERALITY = { left: "Izquierda", right: "Derecha", bilateral: "Bilateral" } as const;

function evaluationResult(item: ClinicalEvaluation) {
  if (item.result.kind === "quantity") return `${item.result.value} ${item.result.unit ?? ""}`.trim();
  if (item.result.kind === "boolean") return item.result.value ? "Sí" : "No";
  if (item.result.kind === "absent") return `No realizado · ${ABSENT_LABELS[item.result.reason]}${item.result.note ? ` · ${item.result.note}` : ""}`;
  return item.result.value;
}

function visitDate(value: string) {
  return new Intl.DateTimeFormat("es-AR", { timeZone: "America/Argentina/Buenos_Aires", weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date(value));
}
function visitTime(value?: string) {
  return value ? new Intl.DateTimeFormat("es-AR", { timeZone: "America/Argentina/Buenos_Aires", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(value)) : "Sin registrar";
}

export default async function VisitPage({ params }: { params: Promise<{ id: string; visitId: string }> }) {
  if (!canRenderLocalClinicalSurface()) notFound();
  await requireClinicalSession();
  const { id, visitId } = await params;
  const dependencies = createClinicalDependencies();
  const [visit, patient, patientVisits] = await Promise.all([dependencies.visits.getById(visitId), dependencies.patients.getById(id), dependencies.visits.listByPatientId(id)]);
  if (!visit || !patient || visit.patientId !== id) notFound();
  const [metrics, evaluations, procedures, treatment] = await Promise.all([dependencies.metrics.listByVisitId(visitId), dependencies.evaluations.listByVisitId(visitId), dependencies.procedures.listByVisitId(visitId), dependencies.treatments.getById(visit.treatmentId)]);
  const appointment = visit.appointmentId ? await dependencies.scheduledVisits.getById(visit.appointmentId) : null;
  const punctuality = deriveStartPunctuality(visit, appointment);
  const documentation = deriveDocumentationTimeliness(visit);
  const orderedVisits = patientVisits.filter((item) => item.treatmentId === visit.treatmentId && item.status === "finished").sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  const sessionNumber = orderedVisits.findIndex((item) => item.id === visit.id) + 1;
  const punctualityLabel = punctuality ? punctuality === "on-time" ? "En horario" : punctuality === "delayed" ? "Demorada" : "Demora importante" : appointment ? "Sin horario acordado" : "Visita espontánea";
  return <main className="shell clinical-shell visit-record-shell">
    <Link className="back-link" href={`/patients/${encodeURIComponent(id)}`}>Volver al paciente</Link>
    <p className="eyebrow">Registro completo de la visita</p>
    <h1>{patient.givenName} {patient.familyName}</h1>
    <p className="lede visit-record-date">{sessionNumber > 0 ? `Sesión ${sessionNumber}${treatment?.plannedSessionCount ? ` de ${treatment.plannedSessionCount}` : ""} · ` : ""}{visitDate(visit.startedAt)}</p>
    <section className="visit-record-summary" aria-label="Resumen de la visita">
      <strong className="visit-time-range">{visitTime(visit.startedAt)}–{visitTime(visit.endedAt)}</strong>
      <span className="record-badge">{visit.captureMode === "retrospective" ? "Carga diferida" : "En vivo"}</span>
      <span className={`record-badge punctuality-${punctuality ?? "none"}`}>{punctualityLabel}</span>
    </section>
    <section className="clinical-panel visit-detail">
      <header className="visit-detail-heading"><p className="eyebrow">Narrativa de la visita</p><h2>Registro clínico</h2></header>
      <section className="visit-narrative-section"><h3>Estado y respuesta</h3><p>{visit.clinicalNote?.statusAndResponse || visit.clinicalNote?.assessment || visit.clinicalNote?.subjective || "Sin registrar"}</p></section>
      <section className="visit-narrative-section evaluation-section"><div className="visit-section-heading"><h3>Evaluaciones</h3><span>{evaluations.length}</span></div>{evaluations.length ? <div className="visit-evaluation-list">{evaluations.map((item) => <article className={`visit-evaluation-card${item.name === "Dolor NRS" ? " is-pain" : ""}`} key={item.id}><div><span>{DOMAIN_LABELS[item.domain]}</span><h4>{item.name}</h4><strong>{evaluationResult(item)}</strong></div>{item.context && Object.values(item.context).some(Boolean) ? <dl>{item.context.bodySite ? <div><dt>Región</dt><dd>{item.context.bodySite}</dd></div> : null}{item.context.laterality ? <div><dt>Lateralidad</dt><dd>{LATERALITY[item.context.laterality]}</dd></div> : null}{item.context.method ? <div><dt>Método</dt><dd>{item.context.method}</dd></div> : null}{item.context.assistanceDevice ? <div><dt>Ayuda o asistencia</dt><dd>{item.context.assistanceDevice}</dd></div> : null}{item.context.conditions ? <div><dt>Condiciones</dt><dd>{item.context.conditions}</dd></div> : null}{item.context.interpretation ? <div><dt>Interpretación</dt><dd>{item.context.interpretation}</dd></div> : null}</dl> : null}<Link className="evaluation-history-link" href={`/patients/${encodeURIComponent(id)}#evaluation-series-${encodeURIComponent(item.seriesId)}`}>Ver evolución de {item.name}</Link></article>)}</div> : <p>Sin evaluaciones registradas en esta visita.</p>}</section>
      <section className="visit-narrative-section"><h3>Intervención realizada</h3><p>{visit.clinicalNote?.intervention || "Sin registrar"}</p>{procedures.length ? <div className="procedure-family-block"><h4>Procedimientos registrados</h4><ul className="procedure-tag-list">{procedures.map((item) => <li key={item.id}>{item.family === "other" ? item.otherName : PROCEDURE_LABELS[item.family]}</li>)}</ul></div> : null}</section>
      <section className="visit-narrative-section"><h3>Próximo paso</h3><p>{visit.clinicalNote?.nextPlan || "Sin registrar"}</p></section>
      {!evaluations.length && metrics.length ? <ul>{metrics.map((metric) => <li key={metric.id}>{metric.code}: {metric.value} {metric.unit}</li>)}</ul> : null}
      <section className="visit-narrative-section visit-operational-detail"><h3>Información del registro</h3><dl className="context-list"><div><dt>Horario acordado</dt><dd>{appointment?.startsAt ? formatClinicalDateTime(appointment.startsAt) : appointment ? `${appointment.scheduledDate} · Sin horario` : "Visita espontánea"}</dd></div><div><dt>Puntualidad</dt><dd>{punctualityLabel}</dd></div><div><dt>Documentación</dt><dd>{documentation ? documentation === "at-the-time" ? "Registrada en el momento" : documentation === "same-day" ? "Registrada en el día" : "Registrada posteriormente" : "Sin calcular"}</dd></div></dl></section>
    </section>
    <Link className="primary-link" href={`/inicio?vista=agenda&agendar=${encodeURIComponent(id)}`}>Agendar próxima visita</Link>
  </main>;
}
