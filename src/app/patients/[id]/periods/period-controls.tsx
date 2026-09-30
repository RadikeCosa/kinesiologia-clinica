"use client";
import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { periodAction, type PeriodActionState } from "./actions";
import type { TreatmentPeriod } from "@/domain/treatment-period/treatment-period";
import { validQuota } from "@/domain/treatment-period/treatment-period";
export function PeriodControls({period,completed,reserved,treatmentStatus,today,startDate,stale}:{period:TreatmentPeriod;completed:number;reserved:number;treatmentStatus:string;today:string;startDate:string;stale:boolean}) {
 const router=useRouter(),[state,action,pending]=useActionState(periodAction,{} as PeriodActionState),[operationId]=useState(()=>crypto.randomUUID());
 useEffect(()=>{if(state.success) router.refresh();},[router,state.success]);
 const hidden=<><input type="hidden" name="patientId" value={period.patientId}/><input type="hidden" name="treatmentId" value={period.treatmentId}/><input type="hidden" name="periodId" value={period.id}/><input type="hidden" name="expectedVersion" value={period.version??"legacy"}/><input type="hidden" name="operationId" value={operationId}/></>;
 const message=<>{state.error?<p role="alert" className="form-error">{state.error}</p>:null}{state.success?<p role="status">Cambio guardado.</p>:null}</>;
 if(period.phase==="closed") return null;
 return <section className="clinical-panel period-controls"><h2>Continuar el tratamiento</h2>{message}
 {!validQuota(period.quota)?<form action={action} className="visit-form">{hidden}<input type="hidden" name="event" value="quota"/><p>Definir cupo del período. Hasta guardarlo no se pueden agregar visitas.</p><label>Sesiones previstas<input type="number" name="quota" min={1} max={500} required/></label><label>Frecuencia<input name="frequency" defaultValue={period.frequency??""} maxLength={240} required/></label><button disabled={pending} className="submit-button">Definir cupo del período</button></form>:null}
 {period.phase==="open"&&completed>0&&!reserved?<details><summary>Finalizar anticipadamente</summary><form action={action} className="visit-form">{hidden}<input type="hidden" name="event" value="partial"/><p>Se preparará un informe parcial. Después podrás finalizar el tratamiento.</p><label>Motivo del cierre parcial<textarea name="reason" required minLength={5} maxLength={2000} rows={3}/></label><button className="secondary-button" disabled={pending}>Preparar cierre parcial</button></form></details>:null}
 {period.phase==="report-pending"&&period.closure==="partial"?<form action={action}>{hidden}<input type="hidden" name="event" value="cancel-partial"/><button className="button-link" disabled={pending}>Cancelar cierre parcial</button></form>:null}
 {period.phase==="reported"&&!stale&&treatmentStatus==="active"&&period.closure!=="partial"?<details open><summary>Renovar otro período</summary><form action={action} className="visit-form">{hidden}<input type="hidden" name="event" value="renew"/><label>Sesiones del nuevo período<input type="number" name="quota" min={1} max={500} defaultValue={period.quota} required/></label><label>Frecuencia del nuevo período<input name="frequency" defaultValue={period.frequency??""} maxLength={240} required/></label><button disabled={pending} className="submit-button">Renovar período</button></form></details>:null}
 {(period.phase==="reported"&&!stale || period.phase==="open"&&completed===0)&&!reserved?<details><summary>Finalizar tratamiento</summary><form action={action} className="visit-form">{hidden}<input type="hidden" name="event" value="finish"/><p>Primero resolvé las citas abiertas. {completed===0?"Este período se cerrará sin informe porque no tiene sesiones.":"El informe y el historial quedarán disponibles."}</p><label>Fecha de finalización<input type="date" name="endDate" min={startDate} max={today} defaultValue={today} required/></label><button className="secondary-button" disabled={pending}>Finalizar tratamiento</button></form></details>:null}
 {stale&&period.phase==="reported"?<p>El informe está desactualizado. Emití un reemplazo antes de renovar o finalizar.</p>:null}
 </section>;
}
