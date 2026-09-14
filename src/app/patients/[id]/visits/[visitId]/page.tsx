import Link from "next/link";
import { notFound } from "next/navigation";
import { createClinicalDependencies } from "@/infrastructure/fhir/create-clinical-dependencies";
import { canRenderLocalClinicalSurface } from "@/infrastructure/runtime/local-clinical-surface";
import { formatClinicalDateTime } from "../../../format-clinical-date-time";
import { requireClinicalSession } from "@/infrastructure/auth/auth-http";

export const dynamic = "force-dynamic";

export default async function VisitPage({ params }: { params: Promise<{ id: string; visitId: string }> }) {
  if (!canRenderLocalClinicalSurface()) notFound();
  await requireClinicalSession();
  const { id, visitId } = await params;
  const dependencies = createClinicalDependencies();
  const visit = await dependencies.visits.getById(visitId);
  if (!visit || visit.patientId !== id) notFound();
  const metrics = await dependencies.metrics.listByVisitId(visitId);
  return <main className="shell clinical-shell">
    <Link className="back-link" href={`/patients/${encodeURIComponent(id)}`}>Volver al paciente</Link>
    <p className="eyebrow">Visita confirmada en HAPI FHIR</p>
    <h1>Visita</h1>
    <p className="lede">Entrada: {formatClinicalDateTime(visit.startedAt)} · Salida: {visit.endedAt ? formatClinicalDateTime(visit.endedAt) : "Sin registrar"}</p>
    <section className="clinical-panel visit-detail">
      <h2>Registro clínico</h2>
      <dl className="context-list">
        <div><dt>Estado inicial</dt><dd>{visit.clinicalNote?.subjective || "Sin registrar"}</dd></div>
        <div><dt>Intervención</dt><dd>{visit.clinicalNote?.intervention || "Sin registrar"}</dd></div>
        <div><dt>Respuesta</dt><dd>{visit.clinicalNote?.assessment || "Sin registrar"}</dd></div>
        <div><dt>Continuidad</dt><dd>{visit.clinicalNote?.nextPlan || "Sin registrar"}</dd></div>
      </dl>
      {metrics.length ? <ul>{metrics.map((metric) => <li key={metric.id}>{metric.code}: {metric.value} {metric.unit}</li>)}</ul> : null}
    </section>
  </main>;
}
