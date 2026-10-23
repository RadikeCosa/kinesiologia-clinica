"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { authorizeThirdPartyDisclosure, closeConsultation, closeConsultationEvaluationAppointment, issueConsultationQuote, recordInitialEvaluation, rescheduleConsultationEvaluation, respondToConsultationQuote, revokeThirdPartyDisclosure, scheduleConsultationEvaluation, startTreatmentFromConsultation, updateConsultationFollowUp } from "@/application/consultations/manage-consultations";
import { requireClinicalSession } from "@/infrastructure/auth/auth-http";
import { createClinicalDependencies } from "@/infrastructure/fhir/create-clinical-dependencies";
import { canRenderLocalClinicalSurface } from "@/infrastructure/runtime/local-clinical-surface";
import { toBuenosAiresInstant } from "@/domain/schedule/scheduled-visit";

async function setup() {
  if (!canRenderLocalClinicalSurface()) throw new Error("Esta función solo está habilitada en el entorno de datos ficticios.");
  await requireClinicalSession();
  return createClinicalDependencies();
}
function returnWithError(id: string, error: unknown): never {
  const message = error instanceof Error ? error.message : "No se pudo guardar el cambio.";
  redirect(`/consultas/${encodeURIComponent(id)}?error=${encodeURIComponent(message)}`);
}
export async function submitQuote(formData: FormData) {
  const id = String(formData.get("consultationId") ?? "");
  try {
    const dependencies = await setup();
    await issueConsultationQuote({
      consultationId: id,
      expectedVersion: String(formData.get("expectedVersion") ?? ""),
      scope: String(formData.get("scope") ?? "initial-evaluation") as "initial-evaluation" | "treatment",
      amount: Number(formData.get("amount")), currency: String(formData.get("currency") ?? "ARS"),
      modality: String(formData.get("modality") ?? ""), communicatedAt: new Date().toISOString(),
      nextFollowUpAt: (() => { const [date, time] = String(formData.get("nextFollowUpAt") ?? "").split("T"); return date && time ? toBuenosAiresInstant(date, time) : ""; })(),
    }, dependencies);
    revalidatePath("/inicio");
    revalidatePath(`/consultas/${id}`);
  } catch (error) { return returnWithError(id, error); }
  redirect(`/consultas/${encodeURIComponent(id)}`);
}
export async function submitThirdPartyAuthorization(formData: FormData) {
  const id = String(formData.get("consultationId") ?? "");
  try {
    const dependencies = await setup();
    if (formData.get("authorizationConfirmed") !== "yes") throw new Error("Confirmá que la persona autorizó esta comunicación.");
    await authorizeThirdPartyDisclosure({
      consultationId: id, expectedVersion: String(formData.get("expectedVersion") ?? ""),
      recipientContactId: String(formData.get("recipientContactId") ?? ""), recipientName: String(formData.get("recipientName") ?? ""),
      relationship: String(formData.get("relationship") ?? ""), phone: String(formData.get("recipientPhone") ?? "") || undefined,
      actorContactId: String(formData.get("actorContactId") ?? ""), method: String(formData.get("method") ?? "verbal") as "verbal" | "written" | "digital",
      at: new Date().toISOString(), scope: String(formData.get("scope") ?? ""),
    }, dependencies);
    revalidatePath("/inicio");
    revalidatePath(`/consultas/${id}`);
  } catch (error) { return returnWithError(id, error); }
  redirect(`/consultas/${encodeURIComponent(id)}`);
}
export async function submitRevokeThirdPartyAuthorization(formData: FormData) {
  const id = String(formData.get("consultationId") ?? "");
  try {
    const dependencies = await setup();
    await revokeThirdPartyDisclosure({
      consultationId: id, expectedVersion: String(formData.get("expectedVersion") ?? ""),
      authorizationId: String(formData.get("authorizationId") ?? ""), actorContactId: String(formData.get("actorContactId") ?? ""),
      method: String(formData.get("method") ?? "verbal") as "verbal" | "written" | "digital",
      at: new Date().toISOString(), reason: String(formData.get("reason") ?? ""),
    }, dependencies);
    revalidatePath("/inicio");
    revalidatePath(`/consultas/${id}`);
  } catch (error) { return returnWithError(id, error); }
  redirect(`/consultas/${encodeURIComponent(id)}`);
}
export async function submitQuoteResponse(formData: FormData) {
  const id = String(formData.get("consultationId") ?? "");
  try {
    const dependencies = await setup();
    await respondToConsultationQuote({
      consultationId: id, expectedVersion: String(formData.get("expectedVersion") ?? ""),
      quoteId: String(formData.get("quoteId") ?? ""), response: String(formData.get("response") ?? "") as "accepted" | "rejected",
      contactId: String(formData.get("contactId") ?? ""), at: new Date().toISOString(),
      nextFollowUpAt: (() => { const [date, time] = String(formData.get("nextFollowUpAt") ?? "").split("T"); return date && time ? toBuenosAiresInstant(date, time) : ""; })(),
    }, dependencies);
    revalidatePath("/inicio");
    revalidatePath(`/consultas/${id}`);
  } catch (error) { return returnWithError(id, error); }
  redirect(`/consultas/${encodeURIComponent(id)}`);
}

function parseDateAndTime(formData: FormData) {
  const scheduledDate = String(formData.get("scheduledDate") ?? "");
  const time = String(formData.get("time") ?? "");
  return { scheduledDate, startsAt: time ? toBuenosAiresInstant(scheduledDate, time) : undefined };
}

export async function submitEvaluationAppointment(formData: FormData) {
  const id = String(formData.get("consultationId") ?? "");
  try {
    const dependencies = await setup();
    await scheduleConsultationEvaluation({
      consultationId: id, expectedVersion: String(formData.get("expectedVersion") ?? ""),
      clientAppointmentId: String(formData.get("clientAppointmentId") ?? ""), ...parseDateAndTime(formData),
      durationMinutes: Number(formData.get("durationMinutes") ?? 60),
    }, dependencies);
    revalidatePath("/inicio");
    revalidatePath(`/consultas/${id}`);
  } catch (error) { return returnWithError(id, error); }
  redirect(`/consultas/${encodeURIComponent(id)}`);
}

export async function submitRescheduleEvaluationAppointment(formData: FormData) {
  const id = String(formData.get("consultationId") ?? "");
  try {
    const dependencies = await setup();
    await rescheduleConsultationEvaluation({
      consultationId: id, expectedVersion: String(formData.get("expectedVersion") ?? ""),
      appointmentId: String(formData.get("appointmentId") ?? ""), expectedAppointmentVersion: String(formData.get("expectedAppointmentVersion") ?? ""),
      clientAppointmentId: String(formData.get("clientAppointmentId") ?? ""), ...parseDateAndTime(formData),
      durationMinutes: Number(formData.get("durationMinutes") ?? 60),
      reason: String(formData.get("reason") ?? "other") as "patient-or-family" | "professional" | "health-event" | "logistics-or-weather" | "other",
      note: String(formData.get("note") ?? "") || undefined,
    }, dependencies);
    revalidatePath("/inicio");
    revalidatePath(`/consultas/${id}`);
  } catch (error) { return returnWithError(id, error); }
  redirect(`/consultas/${encodeURIComponent(id)}`);
}

export async function submitCloseEvaluationAppointment(formData: FormData) {
  const id = String(formData.get("consultationId") ?? "");
  try {
    const dependencies = await setup();
    await closeConsultationEvaluationAppointment({
      consultationId: id, expectedVersion: String(formData.get("expectedVersion") ?? ""),
      appointmentId: String(formData.get("appointmentId") ?? ""), expectedAppointmentVersion: String(formData.get("expectedAppointmentVersion") ?? ""),
      status: String(formData.get("status") ?? "cancelled") as "cancelled" | "not-performed",
      reason: String(formData.get("reason") ?? "other") as "patient-or-family" | "professional" | "health-event" | "logistics-or-weather" | "other",
      note: String(formData.get("note") ?? "") || undefined,
      nextFollowUpAt: (() => { const [date, time] = String(formData.get("nextFollowUpAt") ?? "").split("T"); return date && time ? toBuenosAiresInstant(date, time) : ""; })(),
    }, dependencies);
    revalidatePath("/inicio");
    revalidatePath(`/consultas/${id}`);
  } catch (error) { return returnWithError(id, error); }
  redirect(`/consultas/${encodeURIComponent(id)}`);
}

function dateTimeInput(formData: FormData, name: string) {
  const [date, time] = String(formData.get(name) ?? "").split("T");
  return date && time ? toBuenosAiresInstant(date, time) : "";
}

export async function submitInitialEvaluation(formData: FormData) {
  const id = String(formData.get("consultationId") ?? "");
  try {
    const dependencies = await setup();
    if (formData.get("appointmentId") && formData.get("resolveAppointment") !== "yes") throw new Error("Confirmá la resolución de la cita vinculada.");
    await recordInitialEvaluation({
      operationId: String(formData.get("operationId") ?? ""), consultationId: id,
      appointmentId: String(formData.get("appointmentId") ?? "") || undefined, expectedVersion: String(formData.get("expectedVersion") ?? ""),
      expectedAppointmentVersion: String(formData.get("expectedAppointmentVersion") ?? "") || undefined,
      startedAt: dateTimeInput(formData, "startedAt"), endedAt: dateTimeInput(formData, "endedAt"),
      reason: String(formData.get("reason") ?? ""), subjective: String(formData.get("subjective") ?? "") || undefined,
      objective: String(formData.get("objective") ?? "") || undefined, assessment: String(formData.get("assessment") ?? ""),
      goalsAndPlan: String(formData.get("goalsAndPlan") ?? "") || undefined,
      clinicalEntries: JSON.parse(String(formData.get("clinicalEntries") ?? "{}")),
      consentContactId: String(formData.get("consentContactId") ?? ""), consentMethod: String(formData.get("consentMethod") ?? "verbal"),
      consentAt: dateTimeInput(formData, "consentAt"), consentConfirmed: formData.get("consentConfirmed") === "yes",
    }, dependencies);
    revalidatePath("/inicio");
    revalidatePath(`/consultas/${id}`);
  } catch (error) { return returnWithError(id, error); }
  redirect(`/consultas/${encodeURIComponent(id)}`);
}

export async function submitStartTreatmentFromConsultation(formData: FormData) {
  const consultationId = String(formData.get("consultationId") ?? "");
  const patientId = String(formData.get("patientId") ?? "");
  try {
    const dependencies = await setup();
    const precautions = String(formData.get("precautions") ?? "").split("\n").map((value) => value.trim()).filter(Boolean);
    const diagnosisText = String(formData.get("diagnosis") ?? "").trim();
    const diagnoses = diagnosisText ? [{ clientId: String(formData.get("diagnosisId") ?? ""), text: diagnosisText, kind: String(formData.get("diagnosisKind") ?? "medical_reference") }] : [];
    await startTreatmentFromConsultation({
      consultationId, expectedVersion: String(formData.get("expectedVersion") ?? ""), clientId: String(formData.get("clientId") ?? ""), patientId,
      startDate: formData.get("startDate"), plannedSessionCount: formData.get("plannedSessionCount"), plannedFrequency: formData.get("plannedFrequency"),
      initialFunctionalStatus: formData.get("initialFunctionalStatus"), therapeuticGoals: formData.get("therapeuticGoals"), frameworkPlan: formData.get("frameworkPlan"),
      precautions, diagnoses,
      consentContactId: String(formData.get("consentContactId") ?? ""), consentMethod: String(formData.get("consentMethod") ?? "verbal"),
      consentAt: dateTimeInput(formData, "consentAt"), consentConfirmed: formData.get("consentConfirmed") === "yes",
    }, dependencies);
    revalidatePath("/inicio");
    revalidatePath(`/patients/${encodeURIComponent(patientId)}`);
    revalidatePath(`/consultas/${encodeURIComponent(consultationId)}`);
  } catch (error) { return returnWithError(consultationId, error); }
  redirect(`/patients/${encodeURIComponent(patientId)}`);
}

export async function submitUpdateFollowUp(formData: FormData) {
  const id = String(formData.get("consultationId") ?? "");
  try {
    const dependencies = await setup();
    const action = String(formData.get("action") ?? "") as "reschedule" | "complete" | "cancel";
    await updateConsultationFollowUp({
      consultationId: id, expectedVersion: String(formData.get("expectedVersion") ?? ""),
      followUpId: String(formData.get("followUpId") ?? ""), action, at: new Date().toISOString(),
      ...(action === "reschedule" ? { nextFollowUpAt: dateTimeInput(formData, "nextFollowUpAt") } : {}),
      ...(action !== "reschedule" ? { resultOrReason: String(formData.get("resultOrReason") ?? "") } : {}),
    }, dependencies);
    revalidatePath("/inicio");
    revalidatePath(`/consultas/${id}`);
  } catch (error) { return returnWithError(id, error); }
  redirect(`/consultas/${encodeURIComponent(id)}`);
}

export async function submitCloseConsultation(formData: FormData) {
  const id = String(formData.get("consultationId") ?? "");
  try {
    const dependencies = await setup();
    if (formData.get("closeConfirmed") !== "yes") throw new Error("Confirmá el cierre de la consulta.");
    const consultation = await dependencies.consultations.getById(id);
    if (!consultation) throw new Error("No se encontró la consulta.");
    const appointments = await Promise.all(consultation.appointmentIds.map((appointmentId) => dependencies.consultations.getEvaluationAppointment(appointmentId)));
    const openAppointmentIds = appointments.flatMap((appointment) => appointment && ["proposed", "confirmed"].includes(appointment.status) ? [appointment.id] : []);
    const visits = await dependencies.visits.listByPatientId(consultation.patientId);
    await closeConsultation({
      consultationId: id, expectedVersion: String(formData.get("expectedVersion") ?? ""),
      reason: String(formData.get("reason") ?? "") as "no-response" | "quote-declined" | "withdrew" | "referred" | "other",
      note: String(formData.get("note") ?? "").trim() || undefined,
      openAppointmentIds, hasVisitInProgress: visits.some((visit) => visit.status === "in-progress"), at: new Date().toISOString(),
    }, dependencies);
    revalidatePath("/inicio");
    revalidatePath(`/consultas/${id}`);
    revalidatePath("/inicio");
  } catch (error) { return returnWithError(id, error); }
  redirect(`/consultas/${encodeURIComponent(id)}`);
}
