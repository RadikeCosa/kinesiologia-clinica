"use client";

import { useActionState, useState } from "react";
import { submitVisit, type VisitActionState } from "./actions";
import { ClinicalVisitFields } from "../clinical-visit-fields";
import type { ClinicalEvaluation } from "@/domain/visit/clinical-entry";

const initialState: VisitActionState = { error: null };

function localDateTimeNow() {
  const date = new Date();
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function toIso(local: string) {
  const date = new Date(local);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

export function VisitForm({ patientId, treatmentId, clientVisitId, appointmentId, initialMode = "live", priorEvaluations = [], precautions, lastPlan }: { patientId: string; treatmentId: string; clientVisitId: string; appointmentId?: string; initialMode?: "live" | "retrospective"; priorEvaluations?: ClinicalEvaluation[]; precautions?: string; lastPlan?: string }) {
  const [state, action, pending] = useActionState(submitVisit, initialState);
  const [mode, setMode] = useState<"live" | "retrospective">(initialMode);
  const [startedAt, setStartedAt] = useState("");
  const [endedAt, setEndedAt] = useState("");

  return <form className="visit-form clinical-panel" action={action}>
    <input type="hidden" name="patientId" value={patientId} />
    <input type="hidden" name="treatmentId" value={treatmentId} />
    <input type="hidden" name="clientVisitId" value={clientVisitId} />
    {appointmentId ? <input type="hidden" name="appointmentId" value={appointmentId} /> : null}
    <input type="hidden" name="captureMode" value={mode} />
    <input type="hidden" name="startedAt" value={toIso(startedAt)} />
    <input type="hidden" name="endedAt" value={toIso(endedAt)} />

    <fieldset className="mode-options"><legend>¿Cómo registrás la visita?</legend>
      <label><input type="radio" checked={mode === "live"} onChange={() => setMode("live")} /> En vivo</label>
      <label><input type="radio" checked={mode === "retrospective"} onChange={() => setMode("retrospective")} /> Carga diferida</label>
    </fieldset>

    <div className="form-row">
      <label>Entrada<input type="datetime-local" value={startedAt} onChange={(event) => setStartedAt(event.target.value)} required /></label>
      {mode === "live" ? <button className="secondary-button" type="button" onClick={() => setStartedAt(localDateTimeNow())}>Iniciar ahora</button> : null}
    </div>
    <div className="form-row">
      <label>Salida<input type="datetime-local" value={endedAt} onChange={(event) => setEndedAt(event.target.value)} required /></label>
      {mode === "live" ? <button className="secondary-button" type="button" onClick={() => setEndedAt(localDateTimeNow())}>Finalizar ahora</button> : null}
    </div>
    <ClinicalVisitFields priorEvaluations={priorEvaluations} precautions={precautions} lastPlan={lastPlan} errors={state.fieldErrors}/>
    {state.error ? <p className="form-error" role="alert">{state.error}</p> : null}
    <div className="mobile-final-action"><button className="submit-button" type="submit" disabled={pending || !startedAt || !endedAt}>{pending ? "Confirmando…" : "Finalizar visita"}</button></div>
    <p className="clinical-footnote">El registro se confirma solo después de volver a leerlo desde HAPI FHIR. Si hubo un problema de red, reintentá desde este formulario para conservar la misma identidad de visita.</p>
  </form>;
}
