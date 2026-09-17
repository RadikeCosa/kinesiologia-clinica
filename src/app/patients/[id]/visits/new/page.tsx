import Link from "next/link";
import { notFound } from "next/navigation";
import { getPatientContext } from "@/application/patients/get-patient-context";
import { createClinicalDependencies } from "@/infrastructure/fhir/create-clinical-dependencies";
import { canRenderLocalClinicalSurface } from "@/infrastructure/runtime/local-clinical-surface";
import { VisitForm } from "./visit-form";
import { randomUUID } from "node:crypto";
import { requireClinicalSession } from "@/infrastructure/auth/auth-http";

export const dynamic = "force-dynamic";

export default async function NewVisitPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ cita?: string; modo?: string }> }) {
  if (!canRenderLocalClinicalSurface()) notFound();
  await requireClinicalSession();
  const { id } = await params;
  const dependencies = createClinicalDependencies();
  const context = await getPatientContext(id, dependencies);
  if (!context) notFound();
  const { cita, modo } = await searchParams;
  const appointment = cita ? await dependencies.scheduledVisits.getById(cita) : null;
  if (cita && (!appointment || appointment.patientId !== id || appointment.treatmentId !== context.treatment.id)) notFound();
  const [priorEvaluations, visits] = await Promise.all([dependencies.evaluations.listByPatientId(id), dependencies.visits.listByPatientId(id)]);
  const treatmentVisits = visits.filter((visit) => visit.treatmentId === context.treatment.id && visit.status === "finished").sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  const allowedVisitIds = new Set(treatmentVisits.map((visit) => visit.id));
  return <main className="shell clinical-shell visit-entry-shell">
    <Link className="back-link" href={`/patients/${encodeURIComponent(id)}`}>Volver al paciente</Link>
    <p className="eyebrow">Entorno local · Datos ficticios</p>
    <h1>{modo === "diferida" ? "Registrar visita realizada" : "Nueva visita"}</h1>
    <p className="lede">{context.patient.givenName} {context.patient.familyName} · Sesión {treatmentVisits.length + 1}{appointment?.startsAt ? ` · ${new Intl.DateTimeFormat("es-AR", { timeZone: "America/Argentina/Buenos_Aires", hour: "2-digit", minute: "2-digit" }).format(new Date(appointment.startsAt))}` : ""}</p>
    <VisitForm patientId={id} treatmentId={context.treatment.id} clientVisitId={randomUUID()} appointmentId={appointment?.id} initialMode={modo === "diferida" ? "retrospective" : "live"} priorEvaluations={priorEvaluations.filter((item) => allowedVisitIds.has(item.visitId))} precautions={context.treatment.precautions?.join(" · ")} lastPlan={treatmentVisits[0]?.clinicalNote?.nextPlan} />
  </main>;
}
