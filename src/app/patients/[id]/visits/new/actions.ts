"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ZodError } from "zod";
import { createVisit, VisitConflictError } from "@/application/visits/create-visit";
import { FhirClientError } from "@/infrastructure/fhir/core/fhir.errors";
import { createClinicalDependencies } from "@/infrastructure/fhir/create-clinical-dependencies";
import { canRenderLocalClinicalSurface } from "@/infrastructure/runtime/local-clinical-surface";
import { requireClinicalSession } from "@/infrastructure/auth/auth-http";

export interface VisitActionState { error: string | null }

export async function submitVisit(_: VisitActionState, formData: FormData): Promise<VisitActionState> {
  if (!canRenderLocalClinicalSurface()) return { error: "La escritura clínica no está habilitada en este entorno." };
  await requireClinicalSession();
  const patientId = String(formData.get("patientId") ?? "");
  const treatmentId = String(formData.get("treatmentId") ?? "");
  const clientVisitId = String(formData.get("clientVisitId") ?? "");
  const optionalNumber = (key: string) => {
    const value = String(formData.get(key) ?? "").trim();
    return value ? Number(value) : undefined;
  };
  const pain = optionalNumber("pain");
  let visitId: string;
  try {
    const result = await createVisit({
      clientVisitId, patientId, treatmentId,
      captureMode: formData.get("captureMode"),
      startedAt: formData.get("startedAt"),
      endedAt: formData.get("endedAt"),
      clinicalNote: {
        subjective: formData.get("subjective"),
        intervention: formData.get("intervention"),
        assessment: formData.get("assessment"),
        nextPlan: formData.get("nextPlan"),
      },
      metrics: pain === undefined ? [] : [{ code: "pain_nrs_0_10", value: pain }],
    }, createClinicalDependencies());
    visitId = result.visit.id;
  } catch (error) {
    if (error instanceof ZodError) return { error: error.issues[0]?.message ?? "Revisá los datos de la visita." };
    if (error instanceof VisitConflictError) return { error: error.message };
    if (error instanceof FhirClientError) return { error: error.safeMessage };
    return { error: "No se pudo confirmar la visita. Revisá los datos e intentá otra vez." };
  }
  revalidatePath(`/patients/${encodeURIComponent(patientId)}`);
  redirect(`/patients/${encodeURIComponent(patientId)}/visits/${encodeURIComponent(visitId)}`);
}
