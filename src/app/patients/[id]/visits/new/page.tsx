import { ClinicalEnvironmentLabel } from "@/app/clinical-environment";
import { admissionIssue, periodCount, periodVisits } from "@/domain/treatment-period/treatment-period";
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
  if (!context || !context.treatment || context.treatment.status !== "active") notFound();
  const treatment = context.treatment;
  const { cita, modo } = await searchParams;
  const appointment = cita ? await dependencies.scheduledVisits.getById(cita) : null;
  if (cita && (!appointment || appointment.patientId !== id || appointment.treatmentId !== treatment.id)) notFound();
  const [priorEvaluations, priorSymptoms, visits] = await Promise.all([dependencies.evaluations.listByPatientId(id), dependencies.symptoms.listByPatientId(id), dependencies.visits.listByPatientId(id)]);
  const period = await dependencies.periods.current(treatment);
  const issue = admissionIssue(period, visits);
  if (issue) return <main className="shell clinical-shell"><Link className="back-link" href={`/patients/${id}`}>Volver al paciente</Link><h1>No se puede registrar otra visita</h1><p>{issue}</p><Link className="primary-link" href={`/patients/${id}/periods`}>Revisar período e informe</Link></main>;
  const treatmentVisits = periodVisits(period, visits).filter((visit) => visit.treatmentId === treatment.id && visit.status === "finished").sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  const allowedVisitIds = new Set(treatmentVisits.map((visit) => visit.id));
  return <main className="shell clinical-shell visit-entry-shell">
    <Link className="back-link" href={`/patients/${encodeURIComponent(id)}`}>Volver al paciente</Link>
    <p className="eyebrow">{<ClinicalEnvironmentLabel/>}</p>
    <h1>{modo === "diferida" ? "Registrar visita realizada" : "Nueva visita"}</h1>
    <p className="lede">{context.patient.givenName} {context.patient.familyName} · Sesión {periodCount(period, visits).completed + 1}{appointment?.startsAt ? ` · ${new Intl.DateTimeFormat("es-AR", { timeZone: "America/Argentina/Buenos_Aires", hour: "2-digit", minute: "2-digit" }).format(new Date(appointment.startsAt))}` : ""}</p>
    <VisitForm patientId={id} treatmentId={treatment.id} clientVisitId={randomUUID()} appointmentId={appointment?.id} initialMode={modo === "diferida" ? "retrospective" : "live"} priorEvaluations={priorEvaluations.filter((item) => allowedVisitIds.has(item.visitId))} priorSymptoms={priorSymptoms.filter((item) => allowedVisitIds.has(item.visitId))} precautions={treatment.precautions?.join(" · ")} lastPlan={treatmentVisits[0]?.clinicalNote?.nextPlan} />
  </main>;
}
