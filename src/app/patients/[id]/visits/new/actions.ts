"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ZodError } from "zod";
import { createVisit, VisitConflictError } from "@/application/visits/create-visit";
import { FhirClientError } from "@/infrastructure/fhir/core/fhir.errors";
import { createClinicalDependencies } from "@/infrastructure/fhir/create-clinical-dependencies";
import { canRenderLocalClinicalSurface } from "@/infrastructure/runtime/local-clinical-surface";
import { requireClinicalSession } from "@/infrastructure/auth/auth-http";

export interface VisitActionState { error: string | null; fieldErrors?: { statusAndResponse?: string; intervention?: string; clinicalEntries?: string } }

export async function submitVisit(_: VisitActionState, formData: FormData): Promise<VisitActionState> {
  if (!canRenderLocalClinicalSurface()) return { error: "La escritura clínica no está habilitada en este entorno." };
  await requireClinicalSession();
  const patientId = String(formData.get("patientId") ?? "");
  const treatmentId = String(formData.get("treatmentId") ?? "");
  const clientVisitId = String(formData.get("clientVisitId") ?? "");
  let visitId: string;
  try {
    const result = await createVisit({
      clientVisitId, patientId, treatmentId,
      appointmentId: String(formData.get("appointmentId") ?? "").trim() || undefined,
      captureMode: formData.get("captureMode"),
      startedAt: formData.get("startedAt"),
      endedAt: formData.get("endedAt"),
      clinicalNote: {
        statusAndResponse: formData.get("statusAndResponse"),
        intervention: formData.get("intervention"),
        nextPlan: String(formData.get("nextPlan") ?? "").trim() || undefined,
      },
      metrics: [],
      clinicalEntries: JSON.parse(String(formData.get("clinicalEntries") ?? "{}")),
    }, createClinicalDependencies());
    visitId = result.visit.id;
  } catch (error) {
    if (error instanceof ZodError) {
      const fieldErrors: NonNullable<VisitActionState["fieldErrors"]> = {};
      for (const issue of error.issues) { const path = issue.path.join("."); if (path.includes("statusAndResponse")) fieldErrors.statusAndResponse = issue.message; else if (path.includes("intervention")) fieldErrors.intervention = issue.message; else if (path.includes("clinicalEntries")) fieldErrors.clinicalEntries = issue.message; }
      return { error: error.issues[0]?.message ?? "Revisá los datos de la visita.", fieldErrors };
    }
    if (error instanceof VisitConflictError) return { error: error.message };
    if (error instanceof FhirClientError) return { error: error.safeMessage };
    return { error: "No se pudo confirmar la visita. Revisá los datos e intentá otra vez." };
  }
  revalidatePath(`/patients/${encodeURIComponent(patientId)}`);
  redirect(`/patients/${encodeURIComponent(patientId)}/visits/${encodeURIComponent(visitId)}`);
}
