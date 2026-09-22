import Link from "next/link";
import { notFound } from "next/navigation";
import { requireClinicalSession } from "@/infrastructure/auth/auth-http";
import { createClinicalDependencies } from "@/infrastructure/fhir/create-clinical-dependencies";
import { canRenderLocalClinicalSurface } from "@/infrastructure/runtime/local-clinical-surface";
import { CorrectionForm } from "./correction-form";

export const dynamic = "force-dynamic";

function localInput(instant: string) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date(instant));
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`;
}

export default async function CorrectVisitPage({ params }: { params: Promise<{ id: string; visitId: string }> }) {
  if (!canRenderLocalClinicalSurface()) notFound();
  await requireClinicalSession();
  const { id, visitId } = await params;
  const dependencies = createClinicalDependencies();
  const [visit, patient, evaluations, procedures] = await Promise.all([
    dependencies.visits.getById(visitId), dependencies.patients.getById(id),
    dependencies.evaluations.listByVisitId(visitId), dependencies.procedures.listByVisitId(visitId),
  ]);
  if (!visit || !patient || visit.patientId !== id || visit.status !== "finished" || !visit.endedAt || !visit.version) notFound();
  return <main className="shell clinical-shell visit-record-shell">
    <Link className="back-link" href={`/patients/${encodeURIComponent(id)}/visits/${encodeURIComponent(visitId)}`}>Volver al registro</Link>
    <p className="eyebrow">Corrección del registro</p>
    <h1>{patient.givenName} {patient.familyName}</h1>
    <p className="lede">Corregí los datos de la visita confirmada. El motivo quedará registrado junto con el cambio.</p>
    <CorrectionForm patientId={id} visitId={visitId} expectedVersion={visit.version} startedAt={localInput(visit.startedAt)} endedAt={localInput(visit.endedAt)} clinicalNote={visit.clinicalNote} evaluations={evaluations.filter((item) => item.id.startsWith("evaluation-"))} procedures={procedures}/>
  </main>;
}
