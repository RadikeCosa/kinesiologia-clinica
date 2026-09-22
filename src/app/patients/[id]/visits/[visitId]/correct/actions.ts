"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ZodError } from "zod";
import { annulFinishedVisit, correctFinishedVisit } from "@/application/visits/correct-visit";
import { requireClinicalSession } from "@/infrastructure/auth/auth-http";
import { createClinicalDependencies } from "@/infrastructure/fhir/create-clinical-dependencies";
import { FhirClientError } from "@/infrastructure/fhir/core/fhir.errors";
import { canRenderLocalClinicalSurface } from "@/infrastructure/runtime/local-clinical-surface";

export interface CorrectionState { error: string | null }

async function dependencies() {
  if (!canRenderLocalClinicalSurface()) throw new Error("La escritura clínica no está habilitada.");
  await requireClinicalSession();
  return createClinicalDependencies();
}

function safeError(error: unknown) {
  if (error instanceof ZodError) return error.issues[0]?.message ?? "Revisá los datos de la visita.";
  if (error instanceof FhirClientError) return error.safeMessage;
  return error instanceof Error ? error.message : "No se pudo guardar el cambio.";
}

export async function correctVisitAction(_: CorrectionState, formData: FormData): Promise<CorrectionState> {
  const patientId = String(formData.get("patientId") ?? "");
  const visitId = String(formData.get("visitId") ?? "");
  try {
    await correctFinishedVisit({
      patientId, visitId, expectedVersion: formData.get("expectedVersion"),
      startedAt: formData.get("startedAt"), endedAt: formData.get("endedAt"), reason: formData.get("reason"),
      clinicalNote: { statusAndResponse: formData.get("statusAndResponse"), intervention: formData.get("intervention"), nextPlan: String(formData.get("nextPlan") ?? "").trim() || undefined },
      clinicalEntries: JSON.parse(String(formData.get("clinicalEntries") ?? "{}")),
    }, await dependencies());
  } catch (error) { return { error: safeError(error) }; }
  revalidatePath("/inicio"); revalidatePath(`/patients/${patientId}`); revalidatePath(`/patients/${patientId}/visits/${visitId}`);
  redirect(`/patients/${patientId}/visits/${visitId}?corrected=1`);
}

export async function annulFinishedVisitAction(_: CorrectionState, formData: FormData): Promise<CorrectionState> {
  const patientId = String(formData.get("patientId") ?? "");
  const visitId = String(formData.get("visitId") ?? "");
  try {
    await annulFinishedVisit({ patientId, visitId, expectedVersion: formData.get("expectedVersion"), reason: formData.get("reason") }, await dependencies());
  } catch (error) { return { error: safeError(error) }; }
  revalidatePath("/inicio"); revalidatePath(`/patients/${patientId}`); revalidatePath(`/patients/${patientId}/visits/${visitId}`);
  redirect(`/patients/${patientId}?annulled=1`);
}
