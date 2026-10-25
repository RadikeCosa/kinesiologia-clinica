import { readPeriodReport } from "@/application/periods/read-period-report";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClinicalDependencies } from "@/infrastructure/fhir/create-clinical-dependencies";
import { requireClinicalSession } from "@/infrastructure/auth/auth-http";
import { canRenderLocalClinicalSurface } from "@/infrastructure/runtime/local-clinical-surface";
import { StructuredReport } from "@/app/patients/[id]/periods/report-editor";
export const dynamic="force-dynamic";
export default async function ReportPage({params}:{params:Promise<{reportId:string}>}) {
 if (!canRenderLocalClinicalSurface()) notFound();
 await requireClinicalSession();
 const { reportId } = await params;
 const archive = await readPeriodReport(reportId, createClinicalDependencies());
 if (!archive) notFound();
 const r = archive.report;
 return <main className="shell clinical-shell period-shell"><Link className="back-link" href={`/patients/${r.patientId}/periods?tratamiento=${r.treatmentId}&periodo=${r.periodId}`}>Volver al período</Link><p className="eyebrow">Informe definitivo · {r.status==="superseded"?"Reemplazado":"Vigente"}</p><h1>Informe de evolución</h1><p>Guardado el {new Intl.DateTimeFormat("es-AR",{timeZone:"America/Argentina/Buenos_Aires",dateStyle:"long",timeStyle:"short"}).format(new Date(r.createdAt))}. El contenido no puede modificarse.</p><section className="clinical-panel report-document"><StructuredReport content={r.content}/>{Object.entries({context:"Contexto y objetivos",evolution:"Evolución",interventions:"Intervenciones",nextStep:"Próximo paso",observations:"Observaciones del profesional"}).map(([key,title])=><section key={key}><h2>{title}</h2><p>{r.content.narrative[key as keyof typeof r.content.narrative]||"Sin registrar"}</p></section>)}<p><strong>Profesional:</strong> {r.content.professionalName}{r.content.registration?` · Matrícula ${r.content.registration}`:""}</p>{r.replacementReason?<p>Motivo del reemplazo: {r.replacementReason}</p>:null}{r.replaces?<Link href={`/informes/${r.replaces}`}>Consultar informe original</Link>:null}</section><a className="primary-link" href={`/informes/${r.id}/pdf`}>Descargar PDF</a></main>;
}
