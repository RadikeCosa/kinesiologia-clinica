"use client";
import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { ReportContent } from "@/domain/treatment-period/period-report";
import { saveReportAction, type PeriodActionState } from "./actions";
const titles={context:"Contexto y objetivos",evolution:"Evolución",interventions:"Intervenciones",nextStep:"Próximo paso",observations:"Observaciones del profesional"};
export function StructuredReport({content}:{content:ReportContent}) {
 return <div className="report-structured"><p><strong>{content.patientName}</strong> · Período {content.periodOrdinal} · {content.completed} de {content.quota??"sin cupo"} sesiones</p><p>Frecuencia: {content.frequency??"Sin registrar"}</p>{content.partialReason?<p><strong>Motivo del cierre parcial:</strong> {content.partialReason}</p>:null}<details open><summary>Sesiones realizadas · {content.sessionDates.length}</summary><ul>{content.sessionDates.map((d,i)=><li key={`${i}-${d}`}>{d}</li>)}</ul></details><h3>Mediciones</h3>{content.measurements.length?<ul>{content.measurements.map((m,i)=><li key={i}>{m}</li>)}</ul>:<p>Sin mediciones registradas en este período.</p>}</div>;
}
export function ReportEditor({patientId,treatmentId,periodId,sourceFingerprint,initialContent,replaces}:{patientId:string;treatmentId:string;periodId:string;sourceFingerprint:string;initialContent:ReportContent;replaces?:string}) {
 const router=useRouter();
 const [state,action,pending]=useActionState(saveReportAction,{} as PeriodActionState);
 const [operationId]=useState(()=>crypto.randomUUID());
 const [narrative,setNarrative]=useState(initialContent.narrative);
 const [professionalName,setProfessionalName]=useState(initialContent.professionalName),[registration,setRegistration]=useState(initialContent.registration),[replacementReason,setReplacementReason]=useState("");
 const [confirmed,setConfirmed]=useState(false);
 const [dirty,setDirty]=useState(false),[review,setReview]=useState<{sourceFingerprint:string;content:ReportContent}|null>(null);
 const content=review?.content??initialContent;
 useEffect(()=>{ if(!dirty || state.success) return; const handler=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue="";};window.addEventListener("beforeunload",handler);return()=>window.removeEventListener("beforeunload",handler);},[dirty,state.success]);
 const saved=state.success&&state.reportId;
 if(saved) return <section className="clinical-panel"><h2>Informe guardado</h2><p role="status">El informe es definitivo. Para corregirlo, emití un reemplazo con motivo.</p><div className="report-actions"><Link className="primary-link" href={`/informes/${state.reportId}`}>Ver informe y descargar PDF</Link><button className="button-link" onClick={()=>router.refresh()}>Continuar con el período</button></div></section>;
 return <section className="clinical-panel period-report-editor"><h2>{replaces?"Preparar reemplazo":"Informe de evolución · Borrador"}</h2><p>Revisá el texto antes de guardarlo. Una vez guardado será definitivo.</p><p className="report-draft-warning">Este borrador se conserva solo en esta pantalla. Refrescar o cerrar puede perder la edición. {dirty?"Tenés cambios sin guardar.":""}</p>
 <form action={action} className="visit-form" onChange={()=>setDirty(true)}>
 <input type="hidden" name="patientId" value={patientId}/><input type="hidden" name="treatmentId" value={treatmentId}/><input type="hidden" name="periodId" value={periodId}/><input type="hidden" name="sourceFingerprint" value={review?.sourceFingerprint??sourceFingerprint}/><input type="hidden" name="operationId" value={operationId}/>{replaces?<input type="hidden" name="replaces" value={replaces}/>:null}
 <StructuredReport content={content}/>
 {Object.entries(titles).map(([key,title])=><label key={key}>{title}<textarea name={key} value={narrative[key as keyof typeof titles]} onChange={event=>setNarrative(current=>({...current,[key]:event.target.value}))} rows={key==="observations"?3:5} maxLength={12000}/></label>)}
 <div className="form-grid"><label>Nombre del profesional<input name="professionalName" required maxLength={240} value={professionalName} onChange={event=>setProfessionalName(event.target.value)}/></label><label>Matrícula · opcional<input name="registration" maxLength={120} value={registration} onChange={event=>setRegistration(event.target.value)}/></label></div>
 {replaces?<label>Motivo del reemplazo<textarea name="replacementReason" value={replacementReason} onChange={event=>setReplacementReason(event.target.value)} required minLength={5} maxLength={2000} rows={3}/></label>:null}
 <label className="report-confirmation"><input type="checkbox" required checked={confirmed} onChange={event=>setConfirmed(event.target.checked)}/> Revisé el informe y confirmo su guardado definitivo.</label>
 {state.error?<p className="form-error" role="alert">{state.error}</p>:null}
 {state.updated&&state.updated.sourceFingerprint!==review?.sourceFingerprint?<div className="report-source-update"><p>Hay nuevos datos estructurados. Revisalos antes de volver a guardar. Los apartados que editaste se conservarán.</p><details><summary>Ver registros clínicos actualizados</summary>{Object.entries(titles).map(([key,title])=><section key={key}><h3>{title}</h3><p style={{whiteSpace:"pre-wrap"}}>{state.updated!.content.narrative[key as keyof typeof titles] || "Sin registrar"}</p></section>)}</details><button type="button" className="button-link" onClick={()=>{setReview(state.updated!);setConfirmed(false);}}>Actualizar datos estructurados y conservar mi texto</button></div>:null}
 <button className="submit-button" disabled={pending || !!state.updated && state.updated.sourceFingerprint!==review?.sourceFingerprint}>{pending?"Guardando informe…":"Guardar informe definitivo"}</button>
 </form></section>;
}
