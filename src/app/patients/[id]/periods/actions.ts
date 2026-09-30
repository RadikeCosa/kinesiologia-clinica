"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { savePeriodReport, periodSnapshot, changePeriod } from "@/application/periods/manage-periods";
import { createClinicalDependencies } from "@/infrastructure/fhir/create-clinical-dependencies";
import { requireClinicalSession } from "@/infrastructure/auth/auth-http";
import { canRenderLocalClinicalSurface } from "@/infrastructure/runtime/local-clinical-surface";
import { FhirClientError } from "@/infrastructure/fhir/core/fhir.errors";
import type { ReportContent } from "@/domain/treatment-period/period-report";
export interface PeriodActionState { error?: string; success?: boolean; reportId?: string; updated?: { sourceFingerprint: string; content: ReportContent } }
async function authorize() { if(!canRenderLocalClinicalSurface()) throw new Error("Solo disponible con datos ficticios en el entorno local."); await requireClinicalSession(); return createClinicalDependencies(); }
function message(e:unknown) { return e instanceof ZodError ? e.issues[0]?.message ?? "Revisá los datos." : e instanceof FhirClientError ? e.safeMessage : e instanceof Error ? e.message : "No se pudo completar la operación."; }
function invalidate(patientId:string) { revalidatePath("/inicio"); revalidatePath(`/patients/${patientId}`); revalidatePath(`/patients/${patientId}/periods`); }
export async function saveReportAction(_:PeriodActionState, form:FormData):Promise<PeriodActionState> {
 const patientId=String(form.get("patientId")), treatmentId=String(form.get("treatmentId")), periodId=String(form.get("periodId"));
 const d=await authorize();
 try {
  const result=await savePeriodReport({patientId,treatmentId,periodId,operationId:form.get("operationId"),sourceFingerprint:form.get("sourceFingerprint"),professionalName:form.get("professionalName"),registration:form.get("registration"),narrative:Object.fromEntries(["context","evolution","interventions","nextStep","observations"].map(k=>[k,String(form.get(k)??"")])),replaces:String(form.get("replaces")??"")||undefined,replacementReason:String(form.get("replacementReason")??"").trim()||undefined},d);
  invalidate(patientId);return {success:true,reportId:result.id};
 } catch(e) {
  try { const s=await periodSnapshot(patientId,treatmentId,periodId,d); if(s.sourceFingerprint!==form.get("sourceFingerprint")) return {error:message(e),updated:{sourceFingerprint:s.sourceFingerprint,content:s.content}}; } catch { /* Keep original failure and edited form. */ }
  return {error:message(e)};
 }
}
export async function periodAction(_: PeriodActionState, form: FormData): Promise<PeriodActionState> {
 let nextUrl: string | undefined;
 try {
  const patientId = String(form.get("patientId"));
  const changed = await changePeriod({ patientId, treatmentId: form.get("treatmentId"), periodId: form.get("periodId"), expectedVersion: form.get("expectedVersion"), event: form.get("event"), reason: String(form.get("reason") ?? "").trim() || undefined, quota: form.get("quota") ? Number(form.get("quota")) : undefined, frequency: String(form.get("frequency") ?? "").trim() || undefined, endDate: String(form.get("endDate") ?? "") || undefined, operationId: String(form.get("operationId") ?? "") || undefined }, await authorize());
  invalidate(patientId);
  if (form.get("event") === "renew") nextUrl = `/patients/${patientId}/periods?tratamiento=${changed.treatmentId}&periodo=${changed.id}`;
  else return { success: true };
 } catch(e) { return { error: message(e) }; }
 redirect(nextUrl!);
}
