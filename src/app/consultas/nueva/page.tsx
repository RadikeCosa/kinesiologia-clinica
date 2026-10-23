import { ClinicalEnvironmentLabel } from "@/app/clinical-environment";
import { notFound, redirect } from "next/navigation";
import { requireClinicalSession } from "@/infrastructure/auth/auth-http";
import { canRenderLocalClinicalSurface } from "@/infrastructure/runtime/local-clinical-surface";
import { ConsultationForm } from "./consultation-form";
import { randomUUID } from "node:crypto";

export default async function NewConsultationPage({ searchParams }: { searchParams: Promise<{ op?: string }> }) {
  if (!canRenderLocalClinicalSurface()) notFound();
  await requireClinicalSession();
  const { op } = await searchParams;
  const operationId = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(op ?? "") ? op! : randomUUID();
  if (operationId !== op) redirect(`/consultas/nueva?op=${operationId}`);
  return <main className="shell clinical-shell patient-admin-shell"><p className="eyebrow">{<ClinicalEnvironmentLabel/>}</p><h1>Nueva consulta</h1><p className="lede">Registrá quién se comunica, qué información del paciente está disponible y el próximo contacto.</p><ConsultationForm operationId={operationId}/></main>;
}
