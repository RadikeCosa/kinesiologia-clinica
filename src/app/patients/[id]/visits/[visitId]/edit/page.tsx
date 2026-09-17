import Link from "next/link";
import { notFound } from "next/navigation";
import { createClinicalDependencies } from "@/infrastructure/fhir/create-clinical-dependencies";
import { FinishVisitForm } from "./finish-visit-form";
import { annulVisitAction } from "./actions";
import { requireClinicalSession } from "@/infrastructure/auth/auth-http";
import { canRenderLocalClinicalSurface } from "@/infrastructure/runtime/local-clinical-surface";

export const dynamic = "force-dynamic";

export default async function ContinueVisitPage({ params }: { params: Promise<{ id: string; visitId: string }> }) {
  if (!canRenderLocalClinicalSurface()) notFound();
  await requireClinicalSession();
  const { id, visitId } = await params; const dependencies = createClinicalDependencies();
  const [patient, visit, allVisits, priorEvaluations] = await Promise.all([dependencies.patients.getById(id), dependencies.visits.getById(visitId), dependencies.visits.listByPatientId(id), dependencies.evaluations.listByPatientId(id)]);
  if (!patient || !visit || visit.patientId !== id || visit.status !== "in-progress" || !visit.version) notFound();
  const treatment = await dependencies.treatments.getById(visit.treatmentId);
  const finished = allVisits.filter((item) => item.treatmentId === visit.treatmentId && item.status === "finished" && item.id !== visit.id).sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  const allowedVisitIds = new Set(finished.map((item) => item.id));
  return <main className="shell clinical-shell visit-entry-shell"><Link className="back-link" href="/inicio">Volver a Hoy</Link><p className="eyebrow">Visita en curso</p><h1>{patient.givenName} {patient.familyName}</h1><p className="lede">Sesión {finished.length + 1} · Comenzó {new Intl.DateTimeFormat("es-AR", { timeZone: "America/Argentina/Buenos_Aires", hour: "2-digit", minute: "2-digit" }).format(new Date(visit.startedAt))}</p><FinishVisitForm patientId={id} visitId={visitId} expectedVersion={visit.version} priorEvaluations={priorEvaluations.filter((item) => allowedVisitIds.has(item.visitId))} precautions={treatment?.precautions?.join(" · ")} lastPlan={finished[0]?.clinicalNote?.nextPlan}/><form action={annulVisitAction} className="danger-zone"><input type="hidden" name="patientId" value={id}/><input type="hidden" name="visitId" value={visitId}/><input type="hidden" name="expectedVersion" value={visit.version}/><button className="secondary-button">Anular inicio accidental</button></form></main>;
}
