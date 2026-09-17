"use client";

import { useMemo, useState } from "react";
import type { ClinicalEvaluation, ClinicalEvaluationInput, EvaluationDomain, PerformedProcedureInput, ProcedureFamily } from "@/domain/visit/clinical-entry";

const domainLabels: Record<EvaluationDomain, string> = {
  "pain-symptoms": "Dolor y síntomas", "joint-mobility": "Movilidad articular", strength: "Fuerza",
  "gait-mobility": "Marcha y movilidad funcional", transfers: "Transferencias", "balance-falls": "Equilibrio y caídas",
  "respiratory-exertion": "Función respiratoria y tolerancia al esfuerzo", "environment-independence": "Entorno e independencia",
};
const procedureLabels: Record<ProcedureFamily, string> = {
  "therapeutic-exercise": "Ejercicio terapéutico", "manual-therapy": "Terapia manual", "gait-transfers": "Marcha y transferencias",
  respiratory: "Intervención respiratoria", "education-instructions": "Educación e indicaciones",
  "environment-assistive-devices": "Entorno y ayudas técnicas", other: "Otro",
};
type ResultKind = ClinicalEvaluationInput["result"]["kind"];
type Draft = ClinicalEvaluationInput & { openContext?: boolean };

function blankEvaluation(preset?: Partial<Draft>): Draft {
  return { clientId: crypto.randomUUID(), seriesId: crypto.randomUUID(), domain: "pain-symptoms", name: "", result: { kind: "narrative", value: "" }, ...preset };
}
function resultText(evaluation: ClinicalEvaluationInput) {
  const value = evaluation.result;
  if (value.kind === "quantity") return `${value.value} ${value.unit ?? ""}`.trim();
  if (value.kind === "boolean") return value.value ? "Sí" : "No";
  if (value.kind === "absent") return `No realizado · ${value.reason}`;
  return value.value;
}
function autoGrow(event: React.FormEvent<HTMLTextAreaElement>) {
  event.currentTarget.style.height = "auto"; event.currentTarget.style.height = `${event.currentTarget.scrollHeight}px`;
}
function persistedEvaluation({ openContext, ...evaluation }: Draft): ClinicalEvaluationInput { void openContext; return evaluation; }

export type ClinicalFieldErrors = { statusAndResponse?: string; intervention?: string; clinicalEntries?: string };
export function ClinicalVisitFields({ priorEvaluations = [], precautions, lastPlan, errors }: { priorEvaluations?: ClinicalEvaluation[]; precautions?: string; lastPlan?: string; errors?: ClinicalFieldErrors }) {
  const [evaluations, setEvaluations] = useState<Draft[]>([]);
  const [editing, setEditing] = useState<Draft | null>(null);
  const [procedures, setProcedures] = useState<PerformedProcedureInput[]>([]);
  const [nextPlanOpen, setNextPlanOpen] = useState(false);
  const priorSeries = useMemo(() => Array.from(new Map(priorEvaluations.map((item) => [item.seriesId, item])).values()), [priorEvaluations]);
  const updateResultKind = (kind: ResultKind) => setEditing((current) => current ? { ...current, result: kind === "quantity" ? { kind, value: 0, unit: "" } : kind === "coded" ? { kind, value: "" } : kind === "boolean" ? { kind, value: true } : kind === "narrative" ? { kind, value: "" } : { kind, reason: "not-relevant" } } : null);
  const saveEvaluation = () => {
    if (!editing?.name.trim()) return;
    setEvaluations((current) => [...current.filter((item) => item.clientId !== editing.clientId), editing]); setEditing(null);
  };
  const toggleProcedure = (family: ProcedureFamily, checked: boolean) => setProcedures((current) => checked ? [...current, { family }] : current.filter((item) => item.family !== family));

  return <>
    {(precautions || lastPlan) ? <aside className="visit-context-strip" aria-label="Contexto previo">
      {precautions ? <p><strong>Precauciones:</strong> {precautions}</p> : null}
      {lastPlan ? <p><strong>Último plan:</strong> {lastPlan}</p> : null}
      <details><summary>Ver contexto completo</summary><p>Este contexto proviene del tratamiento y de la última visita confirmada.</p></details>
    </aside> : null}

    <label>Estado y respuesta <span aria-hidden="true">*</span>
      <textarea className="auto-textarea" name="statusAndResponse" maxLength={2000} required rows={2} onInput={autoGrow} aria-describedby="status-help" />
      <small id="status-help">Cómo se encontraba al comenzar, cambios relevantes y respuesta durante la visita.</small>
      {errors?.statusAndResponse ? <span className="field-error" role="alert">{errors.statusAndResponse}</span> : null}
    </label>
    <label>Intervención realizada <span aria-hidden="true">*</span>
      <textarea className="auto-textarea" name="intervention" maxLength={2000} required rows={2} onInput={autoGrow} />
      <small>Técnicas, dosis, adaptaciones y observaciones relevantes.</small>
      {errors?.intervention ? <span className="field-error" role="alert">{errors.intervention}</span> : null}
    </label>

    <section className="clinical-module">
      <button className="module-heading" type="button" aria-expanded={Boolean(editing) || evaluations.length > 0} onClick={() => setEditing((current) => current ?? blankEvaluation())}>
        <span>Evaluaciones{evaluations.length ? ` · ${evaluations.length}` : ""}</span><span>Agregar</span>
      </button>
      <div className="clinical-quick-actions">
        <button type="button" className="secondary-button pain-quick-action" onClick={() => setEditing(blankEvaluation({ domain: "pain-symptoms", name: "Dolor NRS", result: { kind: "quantity", value: 0, unit: "0–10" } }))}>Registrar dolor (0–10)</button>
        {priorSeries.length ? <select aria-label="Repetir evaluación anterior" defaultValue="" onChange={(event) => {
          const prior = priorSeries.find((item) => item.seriesId === event.target.value); if (!prior) return;
          setEditing({ clientId: crypto.randomUUID(), seriesId: prior.seriesId, domain: prior.domain, name: prior.name, result: prior.result, context: prior.context, openContext: Boolean(prior.context) }); event.currentTarget.value = "";
        }}><option value="">Repetir evaluación anterior…</option>{priorSeries.map((item) => <option key={item.seriesId} value={item.seriesId}>{item.name}</option>)}</select> : null}
      </div>
      {evaluations.map((item) => <article className="evaluation-card" key={item.clientId}><div><strong>{item.name}</strong><span>{domainLabels[item.domain]} · {resultText(item)}</span></div><div><button type="button" className="text-button" onClick={() => setEditing(item)}>Editar</button><button type="button" className="text-button" onClick={() => setEvaluations((current) => current.filter((entry) => entry.clientId !== item.clientId))}>Quitar</button></div></article>)}
      {editing ? <div className="evaluation-editor" role="group" aria-label="Editor de evaluación">
        <div className="form-grid"><label>Dominio<select value={editing.domain} onChange={(event) => setEditing({ ...editing, domain: event.target.value as EvaluationDomain })}>{Object.entries(domainLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label>Nombre<input value={editing.name} maxLength={120} onChange={(event) => setEditing({ ...editing, name: event.target.value })} /></label></div>
        <label>Tipo de resultado<select value={editing.result.kind} onChange={(event) => updateResultKind(event.target.value as ResultKind)}><option value="quantity">Cantidad y unidad</option><option value="coded">Ordinal o categórico</option><option value="boolean">Sí / no</option><option value="narrative">Narrativa</option><option value="absent">No realizado</option></select></label>
        {editing.result.kind === "quantity" ? <div className="form-grid"><label>Valor<input type="number" step="any" value={editing.result.value} min={editing.name === "Dolor NRS" ? 0 : undefined} max={editing.name === "Dolor NRS" ? 10 : undefined} onChange={(event) => setEditing({ ...editing, result: { ...editing.result as Extract<Draft["result"], { kind: "quantity" }>, value: Number(event.target.value) } })}/></label><label>Unidad<input value={editing.result.unit ?? ""} onChange={(event) => setEditing({ ...editing, result: { ...editing.result as Extract<Draft["result"], { kind: "quantity" }>, unit: event.target.value } })}/></label></div> : null}
        {editing.result.kind === "coded" || editing.result.kind === "narrative" ? <label>Resultado<input value={editing.result.value} onChange={(event) => setEditing({ ...editing, result: { ...editing.result as Extract<Draft["result"], { kind: "coded" | "narrative" }>, value: event.target.value } })}/></label> : null}
        {editing.result.kind === "boolean" ? <label>Resultado<select value={editing.result.value ? "yes" : "no"} onChange={(event) => setEditing({ ...editing, result: { kind: "boolean", value: event.target.value === "yes" } })}><option value="yes">Sí</option><option value="no">No</option></select></label> : null}
        {editing.result.kind === "absent" ? <><label>Motivo<select value={editing.result.reason} onChange={(event) => setEditing({ ...editing, result: { ...editing.result as Extract<Draft["result"], { kind: "absent" }>, reason: event.target.value as Extract<Draft["result"], { kind: "absent" }>["reason"] } })}><option value="not-relevant">No pertinente</option><option value="deferred">Diferido</option><option value="not-tolerated">No tolerado</option><option value="unsafe-contraindicated">Inseguro o contraindicado</option><option value="refused">Rechazado</option></select></label><label>Nota opcional<input value={editing.result.note ?? ""} onChange={(event) => setEditing({ ...editing, result: { ...editing.result as Extract<Draft["result"], { kind: "absent" }>, note: event.target.value } })}/></label></> : null}
        <details open={editing.openContext} onToggle={(event) => setEditing({ ...editing, openContext: event.currentTarget.open })}><summary>Agregar contexto</summary><div className="form-grid">
          <label>Región corporal<input value={editing.context?.bodySite ?? ""} onChange={(event) => setEditing({ ...editing, context: { ...editing.context, bodySite: event.target.value } })}/></label>
          <label>Lateralidad<select value={editing.context?.laterality ?? ""} onChange={(event) => setEditing({ ...editing, context: { ...editing.context, laterality: event.target.value as "left" | "right" | "bilateral" || undefined } })}><option value="">Sin especificar</option><option value="left">Izquierda</option><option value="right">Derecha</option><option value="bilateral">Bilateral</option></select></label>
          <label>Método o instrumento<input value={editing.context?.method ?? ""} onChange={(event) => setEditing({ ...editing, context: { ...editing.context, method: event.target.value } })}/></label>
          <label>Ayuda o asistencia<input value={editing.context?.assistanceDevice ?? ""} onChange={(event) => setEditing({ ...editing, context: { ...editing.context, assistanceDevice: event.target.value } })}/></label>
          <label>Condiciones<input value={editing.context?.conditions ?? ""} onChange={(event) => setEditing({ ...editing, context: { ...editing.context, conditions: event.target.value } })}/></label>
          <label>Interpretación<input value={editing.context?.interpretation ?? ""} onChange={(event) => setEditing({ ...editing, context: { ...editing.context, interpretation: event.target.value } })}/></label>
        </div></details>
        <div className="form-actions"><button type="button" className="secondary-button" onClick={() => setEditing(null)}>Cancelar</button><button type="button" className="submit-button" disabled={!editing.name.trim() || (editing.name === "Dolor NRS" && (editing.result.kind !== "quantity" || editing.result.value < 0 || editing.result.value > 10))} onClick={saveEvaluation}>Guardar evaluación</button></div>
      </div> : null}
      {errors?.clinicalEntries ? <p className="field-error module-error" role="alert">{errors.clinicalEntries}</p> : null}
    </section>

    <details className="clinical-module"><summary>Procedimientos{procedures.length ? ` · ${procedures.length}` : ""}</summary><div className="procedure-options">{Object.entries(procedureLabels).map(([family, label]) => { const selected = procedures.find((item) => item.family === family); return <label key={family}><span><input type="checkbox" checked={Boolean(selected)} onChange={(event) => toggleProcedure(family as ProcedureFamily, event.target.checked)}/> {label}</span>{family === "other" && selected ? <input aria-label="Nombre del otro procedimiento" required placeholder="Nombre breve" value={selected.otherName ?? ""} onChange={(event) => setProcedures((current) => current.map((item) => item.family === "other" ? { ...item, otherName: event.target.value } : item))}/> : null}</label>; })}</div></details>
    <details className="clinical-module" open={nextPlanOpen} onToggle={(event) => setNextPlanOpen(event.currentTarget.open)}><summary>Próximo paso</summary><label>Continuidad o próximo plan<textarea className="auto-textarea" name="nextPlan" maxLength={2000} rows={2} onInput={autoGrow}/></label></details>
    <input type="hidden" name="clinicalEntries" value={JSON.stringify({ evaluations: evaluations.map(persistedEvaluation), procedures })}/>
  </>;
}
