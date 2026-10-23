import { ClinicalEnvironmentLabel } from "@/app/clinical-environment";
import Link from "next/link";
import { notFound } from "next/navigation";
import { periodSnapshot } from "@/application/periods/manage-periods";
import { getPatientContext } from "@/application/patients/get-patient-context";
import { createClinicalDependencies } from "@/infrastructure/fhir/create-clinical-dependencies";
import { canRenderLocalClinicalSurface } from "@/infrastructure/runtime/local-clinical-surface";
import { requireClinicalSession } from "@/infrastructure/auth/auth-http";
import { ReportEditor, StructuredReport } from "./report-editor";
import { PeriodControls } from "./period-controls";
export const dynamic="force-dynamic";
const labels={open:"Abierto","report-pending":"Informe pendiente",reported:"Informe guardado",closed:"Cerrado"};
export default async function PeriodsPage({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{tratamiento?:string;periodo?:string;reemplazar?:string}>}) {
 if(!canRenderLocalClinicalSurface()) notFound();await requireClinicalSession();const {id}=await params,query=await searchParams,d=createClinicalDependencies();const context=await getPatientContext(id,d);if(!context) notFound();
 const t=query.tratamiento?context.treatments.find(t=>t.id===query.tratamiento):context.treatment;if(!t) notFound();
 const [periods,reports]=await Promise.all([d.periods.list(t),d.reports.list(id)]);
 const selected=query.periodo?periods.find(p=>p.id===query.periodo):periods.find(p=>p.id===t.currentPeriodId)??periods.at(-1);if(!selected) notFound();
 // A virtual first period has not yet been persisted; read via current, preserving a GET without writes.
 const s=await periodSnapshot(id,t.id,selected.version?selected.id:undefined,d),p=s.period;
 const report=p.currentReportId?reports.find(r=>r.id===p.currentReportId):undefined;
 const stale=!!report&&report.sourceFingerprint!==s.sourceFingerprint;
 const replace=query.reemplazar==="1"&&!!report;
 const today=new Intl.DateTimeFormat("en-CA",{timeZone:"America/Argentina/Buenos_Aires",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
 return <main className="shell clinical-shell period-shell"><Link className="back-link" href={`/patients/${id}`}>Volver al paciente</Link><p className="eyebrow">{<ClinicalEnvironmentLabel/>} · Informe de evolución</p><h1>{context.patient.givenName} {context.patient.familyName}</h1><p className="lede">Período {p.ordinal} · {s.count.completed} de {p.quota??"sin cupo"} sesiones · {labels[p.phase]}{s.count.reserved?" · Una visita en curso":""}</p>
 <nav aria-label="Períodos del tratamiento" className="period-navigation">{periods.map(item=><Link key={item.id} aria-current={item.id===p.id?"page":undefined} href={`/patients/${id}/periods?tratamiento=${t.id}&periodo=${item.id}`}>Período {item.ordinal}</Link>)}</nav>
 {report&&!replace?<section className="clinical-panel"><h2>Informe definitivo</h2>{stale?<p role="status">{p.phase==="closed"?"Los registros fuente cambiaron después del cierre. Podés emitir un reemplazo; este período permanecerá cerrado.":"Informe desactualizado: emití un reemplazo antes de renovar o finalizar."}</p>:<p>El informe corresponde a los registros actuales.</p>}<div className="report-actions"><Link className="primary-link" href={`/informes/${report.id}`}>Ver informe</Link><Link className="button-link" href={`/informes/${report.id}/pdf`}>Descargar PDF</Link><Link className="button-link" href={`/patients/${id}/periods?tratamiento=${t.id}&periodo=${p.id}&reemplazar=1`}>Emitir reemplazo</Link></div></section>:null}
 {p.phase==="report-pending"||replace?<ReportEditor patientId={id} treatmentId={t.id} periodId={p.id} sourceFingerprint={s.sourceFingerprint} initialContent={replace&&report?{...s.content,narrative:report.content.narrative,professionalName:report.content.professionalName,registration:report.content.registration}:s.content} replaces={replace?report?.id:undefined}/>:<section className="clinical-panel"><h2>Sesiones del período</h2><StructuredReport content={s.content}/>{p.phase==="closed"&&!report?<p>Este tratamiento no tiene informe histórico para este período.</p>:p.phase==="open"?<p>El informe se preparará al completar el cupo o al solicitar un cierre parcial.</p>:null}</section>}
 {p.id===(t.currentPeriodId??d.periods.firstId(t.id))?<PeriodControls period={p} completed={s.count.completed} reserved={s.count.reserved} treatmentStatus={t.status} startDate={t.startDate} today={today} stale={stale}/>:null}
 <section className="clinical-panel"><h2>Historial de informes</h2>{reports.filter(r=>r.treatmentId===t.id).length?<ul>{reports.filter(r=>r.treatmentId===t.id).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).map(r=><li key={r.id}><Link href={`/informes/${r.id}`}>Período {r.content.periodOrdinal} · {new Intl.DateTimeFormat("es-AR",{timeZone:"America/Argentina/Buenos_Aires",dateStyle:"short",timeStyle:"short"}).format(new Date(r.createdAt))}</Link> · {r.status==="superseded"?"Reemplazado":"Vigente"}{r.replacementReason?` · ${r.replacementReason}`:""}</li>)}</ul>:<p>Sin informes guardados.</p>}</section>
 </main>;
}
