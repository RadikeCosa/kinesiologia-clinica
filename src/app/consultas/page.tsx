import Link from "next/link";
import { notFound } from "next/navigation";
import { getOpenConsultations } from "@/application/consultations/get-open-consultations";
import { requireClinicalSession } from "@/infrastructure/auth/auth-http";
import { canRenderLocalClinicalSurface } from "@/infrastructure/runtime/local-clinical-surface";
import { createClinicalDependencies } from "@/infrastructure/fhir/create-clinical-dependencies";
import { consultationAttention, consultationNextStep } from "@/features/clinical-home/consultations.presenter";
import { ClinicalEnvironmentLabel } from "@/app/clinical-environment";
import { SessionRefresh } from "@/app/patients/session-refresh";
import { ConsultationCard } from "./consultation-card";

export const dynamic = "force-dynamic";

export default async function ConsultationsPage() {
  if (!canRenderLocalClinicalSurface()) notFound();
  await requireClinicalSession();
  const now = new Date();
  const consultations = await getOpenConsultations(now, createClinicalDependencies());
  return <main className="clinical-home-shell clinical-home-real consultation-directory">
    <SessionRefresh/>
    <Link className="back-link" href="/inicio?vista=hoy">Volver a Hoy</Link>
    <p className="eyebrow"><ClinicalEnvironmentLabel/></p>
    <header className="operational-header"><div><h1>Consultas abiertas</h1><p>{consultations.length} {consultations.length === 1 ? "consulta en seguimiento" : "consultas en seguimiento"}</p></div><Link className="button-link" href="/consultas/nueva">Nueva consulta</Link></header>
    <p className="consultation-intro">Revisá el próximo paso de cada consulta para continuar la coordinación.</p>
    {consultations.length ? <section className="consultation-directory-list" aria-labelledby="consultation-list-heading"><h2 id="consultation-list-heading" className="sr-only">Consultas en seguimiento</h2>{consultations.map(consultation => <ConsultationCard key={consultation.id} consultation={consultation} description={consultationAttention(consultation, now.toISOString())?.label ?? consultationNextStep(consultation)}/>)}</section> : <div className="day-empty"><h2>No hay consultas abiertas</h2><p>Las nuevas consultas aparecerán acá mientras coordinás la atención.</p></div>}
  </main>;
}
