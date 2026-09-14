import Link from "next/link";
import { notFound } from "next/navigation";
import { getPatientContext } from "@/application/patients/get-patient-context";
import { createClinicalDependencies } from "@/infrastructure/fhir/create-clinical-dependencies";
import { canRenderLocalClinicalSurface } from "@/infrastructure/runtime/local-clinical-surface";
import { formatClinicalDateTime } from "../format-clinical-date-time";
import { requireClinicalSession } from "@/infrastructure/auth/auth-http";

export const dynamic = "force-dynamic";

export default async function PatientPage({ params }: { params: Promise<{ id: string }> }) {
  if (!canRenderLocalClinicalSurface()) notFound();
  await requireClinicalSession();
  const { id } = await params;
  const dependencies = createClinicalDependencies();
  const context = await getPatientContext(id, dependencies);
  if (!context) notFound();
  const visits = await dependencies.visits.listByPatientId(id);

  return <main className="shell clinical-shell">
    <Link className="back-link" href="/patients">Volver a pacientes</Link>
    <p className="eyebrow">Entorno local · Datos ficticios</p>
    <h1>{context.patient.givenName} {context.patient.familyName}</h1>
    <p className="lede">Tratamiento activo desde {context.treatment.startDate}</p>
    <div className="clinical-grid">
      <section className="clinical-panel">
        <h2>Contexto del tratamiento</h2>
        <dl className="context-list">
          <div><dt>Situación inicial</dt><dd>{context.treatment.clinicalContext?.initialFunctionalStatus || "Sin registrar"}</dd></div>
          <div><dt>Objetivos</dt><dd>{context.treatment.clinicalContext?.therapeuticGoals || "Sin registrar"}</dd></div>
          <div><dt>Plan general</dt><dd>{context.treatment.clinicalContext?.frameworkPlan || "Sin registrar"}</dd></div>
        </dl>
        {context.diagnoses.map((diagnosis) => <p key={diagnosis.id}>{diagnosis.kind === "medical_reference" ? "Diagnóstico de referencia" : "Diagnóstico kinésico"}: {diagnosis.text}</p>)}
      </section>
      <section className="clinical-panel">
        <h2>Visitas</h2>
        <Link className="primary-link" href={`/patients/${encodeURIComponent(id)}/visits/new`}>Registrar visita</Link>
        {visits.length ? <ul className="visit-list">{visits.map((visit) => <li key={visit.id}><Link href={`/patients/${encodeURIComponent(id)}/visits/${encodeURIComponent(visit.id)}`}>{formatClinicalDateTime(visit.startedAt)}</Link><span>{visit.status === "finished" ? "Finalizada" : "En curso"}</span></li>)}</ul> : <p>Todavía no hay visitas registradas.</p>}
      </section>
    </div>
    <p className="clinical-footnote">Vista temporal de prueba. Solo se permite usar datos ficticios de 8081.</p>
  </main>;
}
