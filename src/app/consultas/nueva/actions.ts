"use server";

import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { createConsultation } from "@/application/consultations/manage-consultations";
import { requireClinicalSession } from "@/infrastructure/auth/auth-http";
import { createClinicalDependencies } from "@/infrastructure/fhir/create-clinical-dependencies";
import { FhirClientError } from "@/infrastructure/fhir/core/fhir.errors";
import { canRenderLocalClinicalSurface } from "@/infrastructure/runtime/local-clinical-surface";
import { toBuenosAiresInstant } from "@/domain/schedule/scheduled-visit";

export type ConsultationCreationState = { error?: string; consultationId?: string };

export async function submitConsultation(_: ConsultationCreationState, formData: FormData): Promise<ConsultationCreationState> {
  try {
    if (!canRenderLocalClinicalSurface()) throw new Error("Esta función solo está habilitada en el entorno de datos ficticios.");
    await requireClinicalSession();
    const dependencies = createClinicalDependencies();
    const roles = formData.getAll("roles").map(String);
    const patientGivenName = String(formData.get("patientGivenName") ?? "").trim();
    const patientFamilyName = String(formData.get("patientFamilyName") ?? "").trim();
    const consultation = await createConsultation({
      clientId: String(formData.get("clientId") ?? ""),
      initialReason: String(formData.get("initialReason") ?? "").trim() || undefined,
      initialSource: String(formData.get("initialSource") ?? "") || undefined,
      patientId: String(formData.get("patientId") ?? "").trim() || undefined,
      patientGivenName: patientGivenName || undefined,
      patientFamilyName: patientFamilyName || undefined,
      patientPhone: String(formData.get("patientPhone") ?? "").trim() || undefined,
      patientAddress: String(formData.get("patientAddress") ?? "").trim() || undefined,
      contact: {
        id: String(formData.get("contactId") ?? ""),
        name: String(formData.get("contactName") ?? ""),
        relationship: String(formData.get("relationship") ?? ""),
        phone: String(formData.get("contactPhone") ?? "").trim() || undefined,
        roles,
        representationBasis: String(formData.get("representationBasis") ?? "").trim() || undefined,
      },
      contactIsPatient: formData.get("contactIsPatient") === "true",
      dataNoticeRequesterGiven: formData.get("dataNoticeRequesterGiven") === "true",
      dataNoticePatientGiven: formData.get("dataNoticePatientGiven") === "true",
      patientContactId: String(formData.get("patientContactId") ?? "") || undefined,
      patientContactName: patientGivenName || patientFamilyName ? `${patientGivenName} ${patientFamilyName}`.trim() : undefined,
      patientContactRelationship: "Paciente",
      dataNoticeAt: new Date().toISOString(),
      dataNoticeMethod: "digital",
      nextFollowUpAt: (() => { const [date, time] = String(formData.get("nextFollowUpAt") ?? "").split("T"); return date && time ? toBuenosAiresInstant(date, time) : ""; })(),
    }, dependencies);
    revalidatePath("/inicio");
    return { consultationId: consultation.id };
  } catch (error) {
    if (error instanceof ZodError) return { error: error.issues[0]?.message ?? "Revisá los datos." };
    if (error instanceof FhirClientError) return { error: error.safeMessage };
    return { error: error instanceof Error ? error.message : "No se pudo registrar la consulta." };
  }
}
