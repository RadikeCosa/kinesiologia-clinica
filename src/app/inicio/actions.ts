"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ZodError } from "zod";
import { createScheduledVisit, closeScheduledVisit, rescheduleVisit, ScheduleOverlapError } from "@/application/schedule/manage-scheduled-visits";
import { startVisit, ActiveVisitError } from "@/application/visits/manage-visit-workflow";
import { requireClinicalSession } from "@/infrastructure/auth/auth-http";
import { createClinicalDependencies } from "@/infrastructure/fhir/create-clinical-dependencies";
import { FhirClientError } from "@/infrastructure/fhir/core/fhir.errors";
import { canRenderLocalClinicalSurface } from "@/infrastructure/runtime/local-clinical-surface";
import { selectMostRecentTreatment } from "@/domain/treatment/treatment";

export interface HomeActionState { error: string | null; conflict?: boolean; success?: string }

function errorState(error: unknown): HomeActionState {
  if (error instanceof ScheduleOverlapError) return { error: "El horario se superpone con otra visita. Confirmá que querés guardarlo igualmente.", conflict: true };
  if (error instanceof ZodError) return { error: error.issues[0]?.message ?? "Revisá los datos." };
  if (error instanceof FhirClientError) return { error: error.safeMessage };
  if (error instanceof Error) return { error: error.message };
  return { error: "No se pudo completar la operación." };
}

async function authorize() {
  if (!canRenderLocalClinicalSurface()) throw new Error("La agenda clínica no está habilitada en este entorno.");
  await requireClinicalSession();
  return createClinicalDependencies();
}

export async function saveAppointment(_: HomeActionState, formData: FormData): Promise<HomeActionState> {
  try {
    const dependencies = await authorize();
    const mode = String(formData.get("mode") ?? "create");
    const common = {
      clientAppointmentId: String(formData.get("clientAppointmentId") ?? ""),
      date: String(formData.get("date") ?? ""),
      time: String(formData.get("time") ?? "").trim() || undefined,
      durationMinutes: Number(formData.get("durationMinutes") ?? 60),
      acknowledgeConflict: formData.get("acknowledgeConflict") === "true",
    };
    if (mode === "reschedule") {
      await rescheduleVisit({ ...common, appointmentId: formData.get("appointmentId"), expectedVersion: formData.get("expectedVersion"), reason: formData.get("reason"), note: String(formData.get("note") ?? "").trim() || undefined }, dependencies);
    } else {
      const patientId = String(formData.get("patientId") ?? "");
      const treatment = selectMostRecentTreatment((await dependencies.treatments.listActive()).filter((item) => item.patientId === patientId));
      await createScheduledVisit({ ...common, patientId, treatmentId: treatment?.id ?? "" }, dependencies);
    }
    revalidatePath("/inicio");
    return { error: null, success: mode === "reschedule" ? "Visita reprogramada." : "Visita agendada." };
  } catch (error) { return errorState(error); }
}

export async function changeAppointment(_: HomeActionState, formData: FormData): Promise<HomeActionState> {
  try {
    const dependencies = await authorize();
    const status = formData.get("operation") === "no-show" ? "no-show" : "cancelled";
    await closeScheduledVisit({ appointmentId: formData.get("appointmentId"), expectedVersion: formData.get("expectedVersion"), reason: formData.get("reason"), note: String(formData.get("note") ?? "").trim() || undefined }, status, dependencies);
    revalidatePath("/inicio");
    return { error: null, success: status === "no-show" ? "La visita quedó como no realizada." : "Visita cancelada." };
  } catch (error) { return errorState(error); }
}

export async function beginVisit(formData: FormData) {
  const dependencies = await authorize();
  let visitId: string;
  let patientId = String(formData.get("patientId") ?? "");
  try {
    const visit = await startVisit({
      clientVisitId: String(formData.get("clientVisitId") ?? ""), patientId: formData.get("patientId"), treatmentId: formData.get("treatmentId"),
      appointmentId: String(formData.get("appointmentId") ?? "").trim() || undefined,
    }, dependencies);
    visitId = visit.id;
  } catch (error) {
    if (error instanceof ActiveVisitError) { visitId = error.activeVisit.id; patientId = error.activeVisit.patientId; }
    else throw error;
  }
  redirect(`/patients/${encodeURIComponent(patientId)}/visits/${encodeURIComponent(visitId)}/edit`);
}
