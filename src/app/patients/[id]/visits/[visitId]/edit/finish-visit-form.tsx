"use client";

import { useActionState } from "react";
import { finishVisitAction, type FinishState } from "./actions";
import { ClinicalVisitFields } from "../../clinical-visit-fields";
import type { ClinicalEvaluation } from "@/domain/visit/clinical-entry";

const initialFinishState: FinishState = { error: null };

export function FinishVisitForm({ patientId, visitId, expectedVersion, priorEvaluations = [], precautions, lastPlan }: { patientId: string; visitId: string; expectedVersion: string; priorEvaluations?: ClinicalEvaluation[]; precautions?: string; lastPlan?: string }) {
  const [state, action, pending] = useActionState(finishVisitAction, initialFinishState);
  return <form className="visit-form clinical-panel" action={action}>
    <input type="hidden" name="patientId" value={patientId}/><input type="hidden" name="visitId" value={visitId}/><input type="hidden" name="expectedVersion" value={expectedVersion}/>
    <ClinicalVisitFields priorEvaluations={priorEvaluations} precautions={precautions} lastPlan={lastPlan} errors={state.fieldErrors}/>
    {state.error ? <p className="form-error" role="alert">{state.error}</p> : null}
    <div className="mobile-final-action"><button className="submit-button" disabled={pending}>{pending ? "Confirmando…" : "Finalizar visita"}</button></div>
  </form>;
}
