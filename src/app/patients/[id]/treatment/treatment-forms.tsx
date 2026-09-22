"use client";
import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { startTreatment, transitionTreatment, type TreatmentActionState } from "./actions";
const empty: TreatmentActionState = {};
export function StartTreatmentForm({ patientId, today }: { patientId: string; today: string }) {
  const router = useRouter();
  const [clientId] = useState(() => crypto.randomUUID());
  const [diagnoses, setDiagnoses] = useState(() => [{ id: crypto.randomUUID() }]);
  const [state, action, pending] = useActionState(startTreatment, empty);
  useEffect(() => { if (state.success) router.refresh(); }, [router, state.success]);
  return <form className="visit-form patient-admin-form" action={action}>
    <input type="hidden" name="clientId" value={clientId}/><input type="hidden" name="patientId" value={patientId}/>
    <div className="form-grid"><label>Inicio<input name="startDate" type="date" max={today} defaultValue={today} required/></label><label>Sesiones previstas<input name="plannedSessionCount" type="number" min="1" max="500" required/></label></div>
    <label>Frecuencia prevista<input name="plannedFrequency" placeholder="Por ejemplo, 2 veces por semana" required/></label>
    <details className="clinical-module"><summary>Contexto clínico · opcional</summary>
      <label>Situación inicial<textarea name="initialFunctionalStatus" rows={3}/></label><label>Objetivos<textarea name="therapeuticGoals" rows={3}/></label><label>Plan general<textarea name="frameworkPlan" rows={3}/></label><label>Precauciones, una por línea<textarea name="precautions" rows={3}/></label>
      <fieldset className="diagnosis-inputs"><legend>Diagnósticos</legend>
        {diagnoses.map((diagnosis, index) => <div className="diagnosis-row" key={diagnosis.id}><input type="hidden" name={`diagnosis-id-${index}`} value={diagnosis.id}/><label>Diagnóstico<input name={`diagnosis-${index}`} placeholder="Descripción breve"/></label><label>Tipo<select name={`diagnosis-kind-${index}`} defaultValue="medical_reference"><option value="medical_reference">De referencia</option><option value="kinesiologic_diagnosis">Kinésico</option></select></label>{diagnoses.length > 1 ? <button type="button" className="button-link" onClick={() => setDiagnoses((current) => current.filter((item) => item.id !== diagnosis.id))}>Quitar</button> : null}</div>)}
        <p className="diagnosis-empty">Podés dejarlo vacío y agregar diagnósticos más adelante.</p><button type="button" className="secondary-button add-diagnosis" onClick={() => setDiagnoses((current) => [...current, { id: crypto.randomUUID() }])}>＋ Agregar diagnóstico</button>
      </fieldset>
    </details>
    {state.error ? <p className="form-error" role="alert">{state.error}</p> : null}<button className="submit-button" disabled={pending}>{pending ? "Iniciando…" : "Comenzar tratamiento"}</button>
  </form>;
}
export function TreatmentTransitionForm({ patientId, treatmentId, version, status, startDate, today }: { patientId:string;treatmentId:string;version?:string;status:"active"|"paused";startDate:string;today:string }) { const router=useRouter(); const [next,setNext]=useState<"paused"|"active"|"finished">(status === "paused" ? "active" : "paused"); const [state,action,pending]=useActionState(transitionTreatment,empty); useEffect(()=>{if(state.success) router.refresh();},[router,state.success]); const label=next === "active" ? "Reanudar tratamiento" : next === "paused" ? "Pausar tratamiento" : "Finalizar tratamiento"; return <form action={action} className="treatment-transition-form"><input type="hidden" name="patientId" value={patientId}/><input type="hidden" name="treatmentId" value={treatmentId}/><input type="hidden" name="expectedVersion" value={version??""}/><label>Acción<select value={next} onChange={(event)=>setNext(event.target.value as typeof next)}><option value="paused">Pausar tratamiento</option>{status === "paused"?<option value="active">Reanudar tratamiento</option>:null}<option value="finished">Finalizar tratamiento</option></select></label>{next === "finished"?<label>Fecha de cierre<input name="endDate" type="date" min={startDate} max={today} defaultValue={today} required/></label>:null}<label>Nota opcional<textarea name="note" rows={2}/></label><input type="hidden" name="status" value={next}/>{state.error?<p className="form-error" role="alert">{state.error}</p>:null}<button className="secondary-button" disabled={pending}>{pending?"Guardando…":label}</button></form>; }
