import Link from "next/link";
import { notFound } from "next/navigation";
import { getPatientContext } from "@/application/patients/get-patient-context";
import { createClinicalDependencies } from "@/infrastructure/fhir/create-clinical-dependencies";
import { canRenderLocalClinicalSurface } from "@/infrastructure/runtime/local-clinical-surface";
import { VisitForm } from "./visit-form";
import { randomUUID } from "node:crypto";
import { requireClinicalSession } from "@/infrastructure/auth/auth-http";

export const dynamic = "force-dynamic";

export default async function NewVisitPage({ params }: { params: Promise<{ id: string }> }) {
  if (!canRenderLocalClinicalSurface()) notFound();
  await requireClinicalSession();
  const { id } = await params;
  const context = await getPatientContext(id, createClinicalDependencies());
  if (!context) notFound();
  return <main className="shell clinical-shell">
    <Link className="back-link" href={`/patients/${encodeURIComponent(id)}`}>Volver al paciente</Link>
    <p className="eyebrow">Entorno local · Datos ficticios</p>
    <h1>Nueva visita</h1>
    <p className="lede">{context.patient.givenName} {context.patient.familyName}</p>
    <VisitForm patientId={id} treatmentId={context.treatment.id} clientVisitId={randomUUID()} />
  </main>;
}
