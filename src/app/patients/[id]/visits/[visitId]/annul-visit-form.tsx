"use client";

import { useActionState } from "react";
import { annulFinishedVisitAction, type CorrectionState } from "./correct/actions";

const initialState: CorrectionState = { error: null };

export function AnnulVisitForm({ patientId, visitId, expectedVersion }: { patientId: string; visitId: string; expectedVersion: string }) {
  const [state, action, pending] = useActionState(annulFinishedVisitAction, initialState);
  return <details className="visit-annul-panel"><summary>Anular registro</summary>
    <p>Usá esta opción solo si la visita se registró por error. Dejará de contar como realizada y sus evaluaciones y procedimientos dejarán de mostrarse como vigentes.</p>
    <form action={action}><input type="hidden" name="patientId" value={patientId}/><input type="hidden" name="visitId" value={visitId}/><input type="hidden" name="expectedVersion" value={expectedVersion}/>
      <label>Motivo de la anulación<textarea name="reason" required minLength={5} maxLength={500} rows={2} placeholder="Explicá por qué este registro no corresponde"/></label>
      {state.error ? <p className="form-error" role="alert">{state.error}</p> : null}
      <button className="secondary-button" disabled={pending}>{pending ? "Anulando…" : "Confirmar anulación"}</button>
    </form>
  </details>;
}
