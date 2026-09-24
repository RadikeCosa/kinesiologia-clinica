"use client";

import { useActionState, useState } from "react";
import { ClinicalVisitFields } from "../../clinical-visit-fields";
import type { ClinicalEvaluation, ClinicalSymptom, PerformedProcedure } from "@/domain/visit/clinical-entry";
import type { ClinicalNote } from "@/domain/visit/visit";
import { correctVisitAction, type CorrectionState } from "./actions";

const initialState: CorrectionState = { error: null };

function toInstant(local: string) {
  const date = new Date(`${local}:00-03:00`);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

export function CorrectionForm({ patientId, visitId, expectedVersion, startedAt, endedAt, clinicalNote, evaluations, symptoms, procedures }: {
  patientId: string; visitId: string; expectedVersion: string; startedAt: string; endedAt: string;
  clinicalNote?: ClinicalNote; evaluations: ClinicalEvaluation[]; symptoms: ClinicalSymptom[]; procedures: PerformedProcedure[];
}) {
  const [state, action, pending] = useActionState(correctVisitAction, initialState);
  const [start, setStart] = useState(startedAt);
  const [end, setEnd] = useState(endedAt);
  return <form className="visit-form clinical-panel" action={action}>
    <input type="hidden" name="patientId" value={patientId}/><input type="hidden" name="visitId" value={visitId}/><input type="hidden" name="expectedVersion" value={expectedVersion}/>
    <input type="hidden" name="startedAt" value={toInstant(start)}/><input type="hidden" name="endedAt" value={toInstant(end)}/>
    <div className="form-grid"><label>Entrada efectiva<input type="datetime-local" required value={start} onChange={(event) => setStart(event.target.value)}/></label><label>Salida efectiva<input type="datetime-local" required value={end} onChange={(event) => setEnd(event.target.value)}/></label></div>
    <ClinicalVisitFields initialNote={clinicalNote} initialEvaluations={evaluations} initialSymptoms={symptoms} initialProcedures={procedures.map((item) => ({ family: item.family, otherName: item.otherName }))}/>
    <label>Motivo de la corrección <span aria-hidden="true">*</span><textarea name="reason" required minLength={5} maxLength={500} rows={2} placeholder="Qué dato se corrigió y por qué"/></label>
    {state.error ? <p className="form-error" role="alert">{state.error}</p> : null}
    <div className="mobile-final-action"><button className="submit-button" disabled={pending}>{pending ? "Guardando…" : "Guardar corrección"}</button></div>
  </form>;
}
