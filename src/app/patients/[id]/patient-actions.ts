"use server";

import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { updatePatient } from "@/application/administration/manage-patient-treatment";
import { requireClinicalSession } from "@/infrastructure/auth/auth-http";
import { createClinicalDependencies } from "@/infrastructure/fhir/create-clinical-dependencies";
import { FhirClientError } from "@/infrastructure/fhir/core/fhir.errors";
import { canRenderLocalClinicalSurface } from "@/infrastructure/runtime/local-clinical-surface";

export type PatientActionState = { error?: string; success?: boolean };

async function dependencies() {
  if (!canRenderLocalClinicalSurface()) throw new Error("Esta función solo está disponible en el entorno local de datos ficticios.");
  await requireClinicalSession();
  return createClinicalDependencies();
}

export async function savePatient(_: PatientActionState, formData: FormData): Promise<PatientActionState> {
  try {
    await updatePatient({
      clientId: String(formData.get("clientId") ?? ""),
      givenName: String(formData.get("givenName") ?? ""),
      familyName: String(formData.get("familyName") ?? ""),
      phone: String(formData.get("phone") ?? ""),
      address: String(formData.get("address") ?? ""),
      accessInstructions: String(formData.get("accessInstructions") ?? ""),
    }, String(formData.get("expectedVersion") ?? "") || undefined, await dependencies());
    revalidatePath("/inicio");
    revalidatePath(`/patients/${String(formData.get("patientId") ?? "")}`);
    return { success: true };
  } catch (error) {
    if (error instanceof ZodError) return { error: error.issues[0]?.message ?? "Revisá los datos." };
    if (error instanceof FhirClientError) return { error: error.safeMessage };
    return { error: error instanceof Error ? error.message : "No se pudo guardar la ficha." };
  }
}
