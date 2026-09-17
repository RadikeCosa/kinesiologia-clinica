"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ZodError } from "zod";
import { annulVisitStart, finishVisit } from "@/application/visits/manage-visit-workflow";
import { requireClinicalSession } from "@/infrastructure/auth/auth-http";
import { createClinicalDependencies } from "@/infrastructure/fhir/create-clinical-dependencies";
import { FhirClientError } from "@/infrastructure/fhir/core/fhir.errors";
import { canRenderLocalClinicalSurface } from "@/infrastructure/runtime/local-clinical-surface";

export interface FinishState { error: string | null; fieldErrors?: { statusAndResponse?: string; intervention?: string; clinicalEntries?: string } }

async function dependencies() {
  if (!canRenderLocalClinicalSurface()) throw new Error("La escritura clínica no está habilitada.");
  await requireClinicalSession(); return createClinicalDependencies();
}

export async function finishVisitAction(_: FinishState, formData: FormData): Promise<FinishState> {
  const patientId = String(formData.get("patientId") ?? ""); const visitId = String(formData.get("visitId") ?? "");
  try {
    await finishVisit({
      visitId, expectedVersion: formData.get("expectedVersion"),
      clinicalNote: { statusAndResponse: formData.get("statusAndResponse"), intervention: formData.get("intervention"), nextPlan: String(formData.get("nextPlan") ?? "").trim() || undefined },
      metrics: [], clinicalEntries: JSON.parse(String(formData.get("clinicalEntries") ?? "{}")),
    }, await dependencies());
  } catch (error) {
    if (error instanceof ZodError) {
      const fieldErrors: NonNullable<FinishState["fieldErrors"]> = {};
      for (const issue of error.issues) { const path = issue.path.join("."); if (path.includes("statusAndResponse")) fieldErrors.statusAndResponse = issue.message; else if (path.includes("intervention")) fieldErrors.intervention = issue.message; else if (path.includes("clinicalEntries")) fieldErrors.clinicalEntries = issue.message; }
      return { error: error.issues[0]?.message ?? "Revisá la evolución.", fieldErrors };
    }
    if (error instanceof FhirClientError) return { error: error.safeMessage };
    return { error: error instanceof Error ? error.message : "No se pudo finalizar la visita." };
  }
  revalidatePath("/inicio"); revalidatePath(`/patients/${patientId}`);
  redirect(`/patients/${patientId}/visits/${visitId}?saved=1`);
}

export async function annulVisitAction(formData: FormData) {
  const patientId = String(formData.get("patientId") ?? "");
  await annulVisitStart({ visitId: formData.get("visitId"), expectedVersion: formData.get("expectedVersion") }, await dependencies());
  revalidatePath("/inicio"); revalidatePath(`/patients/${patientId}`); redirect("/inicio");
}
