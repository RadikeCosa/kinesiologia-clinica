import Link from "next/link";
import type { CSSProperties } from "react";
import { notFound } from "next/navigation";
import { createClinicalDependencies } from "@/infrastructure/fhir/create-clinical-dependencies";
import { canRenderLocalClinicalSurface } from "@/infrastructure/runtime/local-clinical-surface";
import { formatClinicalDateTime } from "../../../format-clinical-date-time";
import { requireClinicalSession } from "@/infrastructure/auth/auth-http";
import { deriveDocumentationTimeliness, deriveStartPunctuality } from "@/domain/visit/visit-timeliness";
import type { ClinicalEvaluation, ClinicalSymptom, EvaluationAbsentReason, EvaluationDomain, ProcedureFamily } from "@/domain/visit/clinical-entry";
import { AnnulVisitForm } from "./annul-visit-form";

export const dynamic = "force-dynamic";

const DOMAIN_LABELS: Record<EvaluationDomain, string> = { "joint-mobility": "Movilidad articular", strength: "Fuerza", "gait-mobility": "Marcha y movilidad funcional", transfers: "Transferencias", "balance-falls": "Equilibrio y caídas", "respiratory-exertion": "Función respiratoria y tolerancia al esfuerzo", "environment-independence": "Entorno e independencia" };
const ABSENT_LABELS: Record<EvaluationAbsentReason, string> = { "not-relevant": "No pertinente", deferred: "Diferido", "not-tolerated": "No tolerado", "unsafe-contraindicated": "Inseguro o contraindicado", refused: "Rechazado" };
const PROCEDURE_LABELS: Record<ProcedureFamily, string> = { "therapeutic-exercise": "Ejercicio terapéutico", "manual-therapy": "Terapia manual", "gait-transfers": "Marcha y transferencias", respiratory: "Intervención respiratoria", "education-instructions": "Educación e indicaciones", "environment-assistive-devices": "Entorno y ayudas técnicas", other: "Otro" };
const LATERALITY = { left: "Izquierda", right: "Derecha", bilateral: "Bilateral" } as const;
const SYMPTOM_LABELS = { pain: "Dolor", tiredness: "Cansancio", drowsiness: "Somnolencia", nausea: "Náuseas", "lack-of-appetite": "Falta de apetito", "shortness-of-breath": "Falta de aire", depression: "Ánimo bajo", anxiety: "Ansiedad", custom: "Otro síntoma" } as const;

function evaluationResult(item: ClinicalEvaluation) {
  if (item.result.kind === "quantity") return `${item.result.value} ${item.result.unit ?? ""}`.trim();
  if (item.result.kind === "boolean") return item.result.value ? "Sí" : "No";
  if (item.result.kind === "absent") return `No realizado · ${ABSENT_LABELS[item.result.reason]}${item.result.note ? ` · ${item.result.note}` : ""}`;
  return item.result.value;
}

function symptomLabel(item: ClinicalSymptom) { return item.code === "custom" ? item.name : SYMPTOM_LABELS[item.code]; }

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
  const [metrics, evaluations, symptoms, procedures, treatment] = await Promise.all([dependencies.metrics.listByVisitId(visitId), dependencies.evaluations.listByVisitId(visitId), dependencies.symptoms.listByVisitId(visitId), dependencies.procedures.listByVisitId(visitId), dependencies.treatments.getById(visit.treatmentId)]);
  if (visit.status === "entered-in-error") return <main className="shell clinical-shell visit-record-shell">
    <Link className="back-link" href={`/patients/${encodeURIComponent(id)}`}>Volver al paciente</Link>
    <p className="eyebrow">Registro anulado</p><h1>{patient.givenName} {patient.familyName}</h1>
    <section className="clinical-panel visit-annulled-notice"><h2>Esta visita se registró por error</h2><p>Ya no cuenta como visita realizada ni aporta evaluaciones al seguimiento.</p>{visit.annulReason ? <p><strong>Motivo:</strong> {visit.annulReason}</p> : null}</section>
  </main>;
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
    {visit.correctedAt ? <p className="visit-correction-note">Registro corregido el {formatClinicalDateTime(visit.correctedAt)}{visit.correctionReason ? ` · ${visit.correctionReason}` : ""}.</p> : null}
    <section className="clinical-panel visit-detail">
      <header className="visit-detail-heading"><h2>Lo que ocurrió en la visita</h2></header>
      <section className="visit-narrative-section"><h3>Cómo estaba y cómo respondió</h3><p>{visit.clinicalNote?.statusAndResponse || visit.clinicalNote?.assessment || visit.clinicalNote?.subjective || "Sin registrar"}</p></section>
      {evaluations.length ? <details className="visit-evaluation-details"><summary>Evaluaciones · {evaluations.length}</summary><section className="visit-narrative-section evaluation-section">
        <div className="visit-section-heading"><h3>Evaluaciones</h3><span>{evaluations.length}</span></div>
        <div className="visit-evaluation-list">{evaluations.map((item) => {
          const painValue = item.name === "Dolor NRS" && item.result.kind === "quantity" && item.result.value >= 0 && item.result.value <= 10 ? item.result.value : null;
          const painStyle = painValue === null ? undefined : { "--pain-hue": String(150 - painValue * 14), "--pain-fill": `${painValue * 10}%` } as CSSProperties;
          const hasContext = item.context && Object.values(item.context).some(Boolean);
          const briefContext = [item.context?.bodySite, item.context?.laterality ? LATERALITY[item.context.laterality] : null].filter(Boolean).join(" · ");
          return <article className={`visit-evaluation-card${painValue === null ? "" : " is-pain"}`} style={painStyle} key={item.id}>
            <div><span>{DOMAIN_LABELS[item.domain]}</span><h4>{item.name}</h4><strong>{evaluationResult(item)}</strong></div>
            {painValue !== null ? <div className="pain-nrs-indicator" role="img" aria-label={`Intensidad visual del dolor: ${painValue} de 10`}><span/></div> : null}
            {briefContext ? <p className="evaluation-brief-context">{briefContext}</p> : null}
            {hasContext ? <details className="evaluation-context-details"><summary>Ver contexto</summary><dl>
              {item.context?.bodySite ? <div><dt>Región</dt><dd>{item.context.bodySite}</dd></div> : null}
              {item.context?.laterality ? <div><dt>Lateralidad</dt><dd>{LATERALITY[item.context.laterality]}</dd></div> : null}
              {item.context?.method ? <div><dt>Método</dt><dd>{item.context.method}</dd></div> : null}
              {item.context?.assistanceDevice ? <div><dt>Ayuda o asistencia</dt><dd>{item.context.assistanceDevice}</dd></div> : null}
              {item.context?.conditions ? <div><dt>Condiciones</dt><dd>{item.context.conditions}</dd></div> : null}
              {item.context?.interpretation ? <div><dt>Interpretación</dt><dd>{item.context.interpretation}</dd></div> : null}
            </dl></details> : null}
            <Link className="evaluation-history-link" href={`/patients/${encodeURIComponent(id)}#evaluation-series-${encodeURIComponent(item.seriesId)}`} aria-label={`Ver evolución de ${item.name}`}>Ver evolución</Link>
          </article>;
        })}</div>
      </section></details> : null}
      {symptoms.length ? <details className="visit-evaluation-details"><summary>Síntomas referidos · {symptoms.length}</summary><section className="visit-narrative-section evaluation-section">
        <div className="visit-section-heading"><h3>Síntomas referidos por el paciente</h3><span>{symptoms.length}</span></div>
        <div className="visit-evaluation-list">{symptoms.map((item) => <article className="visit-evaluation-card symptom-record-card" key={item.id}>
          <div><span>Referido por el paciente</span><h4>{symptomLabel(item)}</h4><strong>{item.severity}/10 · {item.severity === 0 ? "Ausente" : "Intensidad"}</strong></div>
          {item.context?.bodySite || item.context?.laterality || item.context?.note ? <p className="evaluation-brief-context">{[item.context.bodySite, item.context.laterality ? LATERALITY[item.context.laterality] : null, item.context.note].filter(Boolean).join(" · ")}</p> : null}
          <Link className="evaluation-history-link" href={`/patients/${encodeURIComponent(id)}#symptom-series-${encodeURIComponent(item.seriesId)}`} aria-label={`Ver evolución de ${symptomLabel(item)}`}>Ver evolución</Link>
        </article>)}</div>
      </section></details> : null}
      <section className="visit-narrative-section"><h3>Qué se hizo</h3>{procedures.length ? <ul className="procedure-tag-list visit-procedure-tags">{procedures.map((item) => <li key={item.id}>{item.family === "other" ? item.otherName : PROCEDURE_LABELS[item.family]}</li>)}</ul> : null}<p>{visit.clinicalNote?.intervention || "Sin registrar"}</p></section>
      {visit.clinicalNote?.nextPlan ? <section className="visit-narrative-section"><h3>Próximo paso</h3><p>{visit.clinicalNote.nextPlan}</p></section> : null}
      {!evaluations.length && !symptoms.length && metrics.length ? <ul>{metrics.map((metric) => <li key={metric.id}>{metric.code}: {metric.value} {metric.unit}</li>)}</ul> : null}
      <details className="visit-operational-detail"><summary>Horarios y registro</summary><dl className="context-list"><div><dt>Horario acordado</dt><dd>{appointment?.startsAt ? formatClinicalDateTime(appointment.startsAt) : appointment ? `${appointment.scheduledDate} · Sin horario` : "Visita espontánea"}</dd></div><div><dt>Documentación</dt><dd>{documentation ? documentation === "at-the-time" ? "Registrada en el momento" : documentation === "same-day" ? "Registrada en el día" : "Registrada posteriormente" : "Sin calcular"}</dd></div></dl></details>
    </section>
    {visit.status === "finished" && visit.version ? <div className="visit-record-management"><Link className="button-link" href={`/patients/${encodeURIComponent(id)}/visits/${encodeURIComponent(visitId)}/correct`}>Corregir visita</Link><AnnulVisitForm patientId={id} visitId={visitId} expectedVersion={visit.version}/></div> : null}
    <Link className="primary-link" href={`/inicio?vista=agenda&agendar=${encodeURIComponent(id)}`}>Agendar próxima visita</Link>
  </main>;
}
