"use client";

import { useMemo, useState, type CSSProperties } from "react";
import type { ClinicalEvaluation, ClinicalEvaluationInput, ClinicalSymptom, ClinicalSymptomInput, EvaluationDomain, PerformedProcedureInput, ProcedureFamily, SymptomCode } from "@/domain/visit/clinical-entry";

const domainLabels: Record<EvaluationDomain, string> = {
  "joint-mobility": "Movilidad articular", strength: "Fuerza",
  "gait-mobility": "Marcha y movilidad funcional", transfers: "Transferencias", "balance-falls": "Equilibrio y caídas",
  "respiratory-exertion": "Función respiratoria y tolerancia al esfuerzo", "environment-independence": "Entorno e independencia",
};
const procedureLabels: Record<ProcedureFamily, string> = {
  "therapeutic-exercise": "Ejercicio terapéutico", "manual-therapy": "Terapia manual", "gait-transfers": "Marcha y transferencias",
  respiratory: "Intervención respiratoria", "education-instructions": "Educación e indicaciones",
  "environment-assistive-devices": "Entorno y ayudas técnicas", other: "Otro",
};
const absentLabels = { "not-relevant": "No pertinente", deferred: "Diferido", "not-tolerated": "No tolerado", "unsafe-contraindicated": "Inseguro o contraindicado", refused: "Rechazado" } as const;
type ResultKind = ClinicalEvaluationInput["result"]["kind"];
type Draft = ClinicalEvaluationInput & { openContext?: boolean; domainChosen?: boolean };
type SymptomDraft = Omit<ClinicalSymptomInput, "severity"> & { severity: number | null };
const symptomLabels: Record<Exclude<SymptomCode, "custom">, string> = {
  pain: "Dolor", tiredness: "Cansancio", drowsiness: "Somnolencia", nausea: "Náuseas",
  "lack-of-appetite": "Falta de apetito", "shortness-of-breath": "Falta de aire", depression: "Ánimo bajo", anxiety: "Ansiedad",
};
const symptomOptions = Object.entries(symptomLabels) as Array<[Exclude<SymptomCode, "custom">, string]>;

function blankEvaluation(preset?: Partial<Draft>): Draft {
  return { clientId: crypto.randomUUID(), seriesId: crypto.randomUUID(), domain: "joint-mobility", name: "", result: { kind: "narrative", value: "" }, domainChosen: preset?.domain !== undefined, ...preset };
}
function resultText(evaluation: ClinicalEvaluationInput) {
  const value = evaluation.result;
  if (value.kind === "quantity") return `${value.value} ${value.unit ?? ""}`.trim();
  if (value.kind === "boolean") return value.value ? "Sí" : "No";
  if (value.kind === "absent") return `No realizado · ${absentLabels[value.reason]}`;
  return value.value;
}
function autoGrow(event: React.FormEvent<HTMLTextAreaElement>) {
  event.currentTarget.style.height = "auto"; event.currentTarget.style.height = `${event.currentTarget.scrollHeight}px`;
}
function persistedEvaluation({ openContext, domainChosen, ...evaluation }: Draft): ClinicalEvaluationInput { void openContext; void domainChosen; return evaluation; }

function SymptomIntensityInput({ symptom, onChange }: { symptom: SymptomDraft; onChange: (value: number | null) => void }) {
  const selected = symptom.severity !== null;
  const value = selected ? symptom.severity! : 0;
  const rangeStyle = { "--pain-fill": `${value * 10}%`, "--pain-hue": String(150 - value * 14) } as CSSProperties;
  const inputId = `symptom-severity-${symptom.clientId}`;
  return <div className="pain-nrs-editor symptom-intensity-editor">
    <div className="pain-nrs-entry">
      <label htmlFor={`${inputId}-number`}>Intensidad de 0 a 10<input id={`${inputId}-number`} type="number" inputMode="numeric" step="1" min="0" max="10" value={selected ? symptom.severity! : ""} placeholder="Sin registrar" aria-describedby={`${inputId}-help`} onChange={(event) => onChange(event.target.value === "" ? null : Number(event.target.value))}/></label>
      <output className="pain-nrs-readout" aria-live="polite">{selected ? <><strong>{symptom.severity}</strong><span>/10</span></> : <span>Sin puntuar</span>}</output>
    </div>
    <label className="pain-nrs-slider-label" htmlFor={inputId}>Elegir intensidad</label>
    <input id={inputId} className={`pain-nrs-slider${selected ? "" : " is-unselected"}`} type="range" min="0" max="10" step="1" value={value} style={rangeStyle} aria-valuetext={selected ? `${symptom.severity} de 10` : "Sin puntuar"} onChange={(event) => onChange(Number(event.target.value))} onPointerUp={(event) => { if (!selected) onChange(Number(event.currentTarget.value)); }} onKeyUp={(event) => { if (!selected && ["Home", "End", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) onChange(Number(event.currentTarget.value)); }}/>
    <div className="pain-nrs-endpoints" id={`${inputId}-help`}><span>0 · Ausente</span><span>10 · Máxima intensidad</span></div>
  </div>;
}

export type ClinicalFieldErrors = { statusAndResponse?: string; intervention?: string; clinicalEntries?: string };
export function ClinicalVisitFields({ structuredOnly = false, priorEvaluations = [], initialEvaluations = [], priorSymptoms = [], initialSymptoms = [], initialProcedures = [], initialNote, precautions, lastPlan, errors }: { structuredOnly?: boolean; priorEvaluations?: ClinicalEvaluation[]; initialEvaluations?: ClinicalEvaluation[]; priorSymptoms?: ClinicalSymptom[]; initialSymptoms?: ClinicalSymptom[]; initialProcedures?: PerformedProcedureInput[]; initialNote?: { statusAndResponse?: string; intervention?: string; nextPlan?: string }; precautions?: string; lastPlan?: string; errors?: ClinicalFieldErrors }) {
  const [evaluations, setEvaluations] = useState<Draft[]>(() => initialEvaluations.map((item) => ({ clientId: item.clientId, seriesId: item.seriesId, domain: item.domain, name: item.name, result: item.result, context: item.context })));
  const [symptoms, setSymptoms] = useState<SymptomDraft[]>(() => initialSymptoms.map((item) => ({ clientId: item.clientId, seriesId: item.seriesId, code: item.code, ...(item.name ? { name: item.name } : {}), severity: item.severity, ...(item.context ? { context: item.context } : {}) })));
  const [customSymptomName, setCustomSymptomName] = useState("");
  const [customSymptomOpen, setCustomSymptomOpen] = useState(false);
  const [editing, setEditing] = useState<Draft | null>(null);
  const [procedures, setProcedures] = useState<PerformedProcedureInput[]>(initialProcedures);
  const [nextPlanOpen, setNextPlanOpen] = useState(Boolean(initialNote?.nextPlan));
  const priorSeries = useMemo(() => Array.from(new Map(priorEvaluations.map((item) => [item.seriesId, item])).values()), [priorEvaluations]);
  const addSymptom = (code: SymptomCode, name?: string) => {
    const normalizedName = name?.trim();
    if (code === "custom" && !normalizedName) return;
    if (symptoms.some((item) => item.code === code && (code !== "custom" || item.name?.toLocaleLowerCase() === normalizedName?.toLocaleLowerCase()))) return;
    const prior = priorSymptoms.find((item) => item.code === code && (code !== "custom" || item.name?.toLocaleLowerCase() === normalizedName?.toLocaleLowerCase()));
    setSymptoms((items) => [...items, { clientId: crypto.randomUUID(), seriesId: prior?.seriesId ?? crypto.randomUUID(), code, ...(code === "custom" ? { name: normalizedName } : {}), severity: null }]);
    setCustomSymptomName(""); setCustomSymptomOpen(false);
  };
  const updateResultKind = (kind: ResultKind) => setEditing((current) => current ? { ...current, result: kind === "quantity" ? { kind, value: Number.NaN, unit: "" } : kind === "coded" ? { kind, value: "" } : kind === "boolean" ? { kind, value: true } : kind === "narrative" ? { kind, value: "" } : { kind, reason: "not-relevant" } } : null);
  const saveEvaluation = () => {
    if (!editing?.name.trim() || editing.domainChosen === false || editing.name.trim().toLocaleLowerCase() === "dolor nrs" || (editing.result.kind === "quantity" && !Number.isFinite(editing.result.value)) || ((editing.result.kind === "coded" || editing.result.kind === "narrative") && !editing.result.value.trim())) return;
    setEvaluations((current) => [...current.filter((item) => item.clientId !== editing.clientId), editing]); setEditing(null);
  };
  const toggleProcedure = (family: ProcedureFamily, checked: boolean) => setProcedures((current) => checked ? [...current, { family }] : current.filter((item) => item.family !== family));

  return <>
    {(precautions || lastPlan) ? <aside className="visit-context-strip" aria-label="Contexto previo">
      {precautions ? <p><strong>Precauciones:</strong> {precautions}</p> : null}
      {lastPlan ? <p><strong>Último plan:</strong> {lastPlan}</p> : null}
      <details><summary>Ver contexto completo</summary><p>Este contexto proviene del tratamiento y de la última visita confirmada.</p></details>
    </aside> : null}

    {!structuredOnly ? <><label>Estado y respuesta <span aria-hidden="true">*</span>
      <textarea className="auto-textarea" name="statusAndResponse" maxLength={2000} required rows={2} onInput={autoGrow} aria-describedby="status-help" defaultValue={initialNote?.statusAndResponse} />
      <small id="status-help">Cómo se encontraba al comenzar, cambios relevantes y respuesta durante la visita.</small>
      {errors?.statusAndResponse ? <span className="field-error" role="alert">{errors.statusAndResponse}</span> : null}
    </label>
    <label>Intervención realizada <span aria-hidden="true">*</span>
      <textarea className="auto-textarea" name="intervention" maxLength={2000} required rows={2} onInput={autoGrow} defaultValue={initialNote?.intervention} />
      <small>Técnicas, dosis, adaptaciones y observaciones relevantes.</small>
      {errors?.intervention ? <span className="field-error" role="alert">{errors.intervention}</span> : null}
    </label>

    </> : null}
    <details className="clinical-module">
      <summary>Evaluaciones{evaluations.length ? ` · ${evaluations.length}` : ""}</summary>
      <div className="clinical-quick-actions">
        <div className="clinical-evaluation-choice"><button type="button" className="secondary-button" aria-describedby="custom-evaluation-help" onClick={() => setEditing(blankEvaluation())}>Evaluación personalizada</button><small id="custom-evaluation-help">Elegí el área y cómo registrar el resultado: una medida, una observación u otro tipo.</small></div>
        {priorSeries.length ? <select aria-label="Repetir evaluación anterior" defaultValue="" onChange={(event) => {
          const prior = priorSeries.find((item) => item.seriesId === event.target.value); if (!prior) return;
          setEditing({ clientId: crypto.randomUUID(), seriesId: prior.seriesId, domain: prior.domain, name: prior.name, result: prior.result, context: prior.context, openContext: Boolean(prior.context) }); event.currentTarget.value = "";
        }}><option value="">Repetir evaluación anterior…</option>{priorSeries.map((item) => <option key={item.seriesId} value={item.seriesId}>{item.name}</option>)}</select> : null}
      </div>
      {evaluations.map((item) => <article className="evaluation-card" key={item.clientId}><div><strong>{item.name}</strong><span>{domainLabels[item.domain]} · {resultText(item)}</span></div><div><button type="button" className="text-button" onClick={() => setEditing(item)}>Editar</button><button type="button" className="text-button" onClick={() => setEvaluations((current) => current.filter((entry) => entry.clientId !== item.clientId))}>Quitar</button></div></article>)}
      {editing ? <div className="evaluation-editor" role="group" aria-label="Editor de evaluación">
        <p className="evaluation-editor-intro">Evaluación personalizada: elegí primero el área y después qué vas a registrar.</p>
        <div className="form-grid"><label>Área de evaluación <span aria-hidden="true">*</span><select required value={editing.domainChosen === false ? "" : editing.domain} onChange={(event) => { const domain = event.target.value as EvaluationDomain; if (domain !== editing.domain) setEditing({ ...editing, domain, domainChosen: true, seriesId: crypto.randomUUID(), name: "", result: { kind: "narrative", value: "" }, context: undefined, openContext: false }); else setEditing({ ...editing, domainChosen: true }); }}>{editing.domainChosen === false ? <option value="" disabled>Elegí un área</option> : null}{Object.entries(domainLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><small>Los síntomas se registran en la sección separada.</small></label>
        <label>¿Qué evaluaste?<input value={editing.name} maxLength={120} placeholder="Por ejemplo, flexión de rodilla" onChange={(event) => setEditing({ ...editing, name: event.target.value })}/></label></div>
        {editing.name.trim().toLocaleLowerCase() === "dolor nrs" ? <p className="field-error" role="alert">El dolor se registra en la sección “Síntomas referidos”.</p> : <label>¿Cómo querés registrar el resultado?<select value={editing.result.kind} onChange={(event) => updateResultKind(event.target.value as ResultKind)}><option value="narrative">Describir lo observado</option><option value="quantity">Registrar una medida numérica</option><option value="coded">Escribir una categoría breve</option><option value="boolean">Responder sí o no</option><option value="absent">No se realizó la evaluación</option></select><small>Elegí la forma que mejor represente lo que observaste.</small></label>}
        {editing.result.kind === "quantity" ? <div className="form-grid"><label>Resultado numérico<input type="number" step="any" value={Number.isFinite(editing.result.value) ? editing.result.value : ""} placeholder="Por ejemplo, 30" onChange={(event) => setEditing({ ...editing, result: { ...editing.result as Extract<Draft["result"], { kind: "quantity" }>, value: event.target.value === "" ? Number.NaN : Number(event.target.value) } })}/></label><label>Unidad, si corresponde<input value={editing.result.unit ?? ""} placeholder="Por ejemplo, grados o segundos" onChange={(event) => setEditing({ ...editing, result: { ...editing.result as Extract<Draft["result"], { kind: "quantity" }>, unit: event.target.value } })}/></label></div> : null}
        {editing.result.kind === "coded" ? <label>Resultado o categoría<input value={editing.result.value} placeholder="Por ejemplo, leve o independiente" onChange={(event) => setEditing({ ...editing, result: { kind: "coded", value: event.target.value } })}/></label> : null}
        {editing.result.kind === "narrative" ? <label>¿Qué observaste?<textarea className="auto-textarea" rows={2} maxLength={500} value={editing.result.value} onInput={autoGrow} onChange={(event) => setEditing({ ...editing, result: { kind: "narrative", value: event.target.value } })}/></label> : null}
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
        <div className="form-actions"><button type="button" className="secondary-button" onClick={() => setEditing(null)}>Cancelar</button><button type="button" className="submit-button" disabled={editing.domainChosen === false || !editing.name.trim() || editing.name.trim().toLocaleLowerCase() === "dolor nrs" || (editing.result.kind === "quantity" && !Number.isFinite(editing.result.value)) || ((editing.result.kind === "coded" || editing.result.kind === "narrative") && !editing.result.value.trim())} onClick={saveEvaluation}>Guardar evaluación</button></div>
      </div> : null}
      {errors?.clinicalEntries ? <p className="field-error module-error" role="alert">{errors.clinicalEntries}</p> : null}
    </details>

    <details className="clinical-module symptom-module">
      <summary>Síntomas referidos{symptoms.length ? ` · ${symptoms.filter((item) => item.severity !== null).length}` : ""}</summary>
      <p className="symptom-intro">Registrá lo que refiere el paciente en este momento. No agregues los síntomas que no evaluaste.</p>
      <div className="symptom-catalog" aria-label="Síntomas frecuentes">
        {symptomOptions.map(([code, label]) => {
          const selected = symptoms.some((item) => item.code === code);
          return <button key={code} className="symptom-choice" type="button" aria-pressed={selected} onClick={() => selected ? setSymptoms((items) => items.filter((item) => item.code !== code)) : addSymptom(code)}>{label}{selected ? <span aria-hidden="true"> ✓</span> : null}</button>;
        })}
        <button className="symptom-choice" type="button" aria-expanded={customSymptomOpen} onClick={() => setCustomSymptomOpen((open) => !open)}>Agregar otro síntoma</button>
      </div>
      {customSymptomOpen ? <div className="custom-symptom-editor"><label htmlFor="custom-symptom-name">Nombre del síntoma<input id="custom-symptom-name" value={customSymptomName} maxLength={120} onChange={(event) => setCustomSymptomName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addSymptom("custom", customSymptomName); } }}/></label><button type="button" className="secondary-button" disabled={!customSymptomName.trim()} onClick={() => addSymptom("custom", customSymptomName)}>Agregar</button></div> : null}
      {symptoms.map((symptom) => <article className="symptom-entry-card" key={symptom.clientId}>
        <header><h4>{symptom.code === "custom" ? symptom.name : symptomLabels[symptom.code]}</h4><button type="button" className="text-button" onClick={() => setSymptoms((items) => items.filter((item) => item.clientId !== symptom.clientId))}>Quitar</button></header>
        <SymptomIntensityInput symptom={symptom} onChange={(severity) => setSymptoms((items) => items.map((item) => item.clientId === symptom.clientId ? { ...item, severity } : item))}/>
        {symptom.severity !== null && (!Number.isInteger(symptom.severity) || symptom.severity < 0 || symptom.severity > 10) ? <p className="field-error" role="alert">Usá un número entero entre 0 y 10.</p> : null}
        <details className="symptom-context-details"><summary>Contexto opcional</summary><div className="form-grid">
          <label>Región corporal<input value={symptom.context?.bodySite ?? ""} maxLength={100} onChange={(event) => setSymptoms((items) => items.map((item) => item.clientId === symptom.clientId ? { ...item, context: { ...item.context, bodySite: event.target.value } } : item))}/></label>
          <label>Lateralidad<select value={symptom.context?.laterality ?? ""} onChange={(event) => setSymptoms((items) => items.map((item) => item.clientId === symptom.clientId ? { ...item, context: { ...item.context, laterality: (event.target.value || undefined) as "left" | "right" | "bilateral" | undefined } } : item))}><option value="">Sin especificar</option><option value="left">Izquierda</option><option value="right">Derecha</option><option value="bilateral">Bilateral</option></select></label>
          <label>Nota breve<input value={symptom.context?.note ?? ""} maxLength={300} onChange={(event) => setSymptoms((items) => items.map((item) => item.clientId === symptom.clientId ? { ...item, context: { ...item.context, note: event.target.value } } : item))}/></label>
        </div></details>
      </article>)}
      <small className="symptom-scale-note">Escala: 0 es ausente y 10 es la máxima intensidad. “Sin puntuar” no se guarda como cero.</small>
    </details>

    <details className="clinical-module"><summary>Procedimientos{procedures.length ? ` · ${procedures.length}` : ""}</summary><div className="procedure-options">{Object.entries(procedureLabels).map(([family, label]) => { const selected = procedures.find((item) => item.family === family); return <label key={family}><span><input type="checkbox" checked={Boolean(selected)} onChange={(event) => toggleProcedure(family as ProcedureFamily, event.target.checked)}/> {label}</span>{family === "other" && selected ? <input aria-label="Nombre del otro procedimiento" required placeholder="Nombre breve" value={selected.otherName ?? ""} onChange={(event) => setProcedures((current) => current.map((item) => item.family === "other" ? { ...item, otherName: event.target.value } : item))}/> : null}</label>; })}</div></details>
    {!structuredOnly ? <details className="clinical-module" open={nextPlanOpen} onToggle={(event) => setNextPlanOpen(event.currentTarget.open)}><summary>Próximo paso</summary><label>Continuidad o próximo plan<textarea className="auto-textarea" name="nextPlan" maxLength={2000} rows={2} onInput={autoGrow} defaultValue={initialNote?.nextPlan}/></label></details> : null}
    <input type="hidden" name="clinicalEntries" value={JSON.stringify({ evaluations: evaluations.map(persistedEvaluation), symptoms: symptoms.flatMap(({ severity, ...symptom }) => severity === null ? [] : [{ ...symptom, severity }]), procedures })}/>
  </>;
}
