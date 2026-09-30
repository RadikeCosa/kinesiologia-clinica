import { z } from "zod";
import type { TreatmentPeriod } from "@/domain/treatment-period/treatment-period";
import type { FhirResource } from "../core/fhir.types";
export const PERIOD_BASE = "https://kinesiologiaadomicilio.local/fhir/StructureDefinition/treatment-period-v1";
export const PERIOD_CATEGORY = "https://kinesiologiaadomicilio.local/fhir/CodeSystem/careplan-category-v1";
export interface PeriodResource extends FhirResource {
  resourceType: "CarePlan";
  status: string;
  intent: "plan";
  subject: { reference: string };
  supportingInfo: { reference: string }[];
  category: { coding: { system: string; code: string }[] }[];
  extension: { url: string; valueString?: string; valueReference?: { reference: string } }[];
}
export function mapPeriodToFhir(period: TreatmentPeriod): PeriodResource {
  const { version: _version, currentReportId, ...data } = period; void _version;
  return { resourceType: "CarePlan", id: period.id, intent: "plan", status: period.phase === "closed" ? "completed" : period.available ? "active" : "on-hold", subject: { reference: `Patient/${period.patientId}` }, supportingInfo: [{ reference: `EpisodeOfCare/${period.treatmentId}` }], category: [{ coding: [{ system: PERIOD_CATEGORY, code: "treatment-period" }] }], extension: [{ url: PERIOD_BASE, valueString: JSON.stringify(data) }, ...(currentReportId ? [{ url: `${PERIOD_BASE}-report`, valueReference: { reference: currentReportId.startsWith("urn:") ? currentReportId : `DocumentReference/${currentReportId}` } }] : [])] };
}
const periodSchema = z.object({
  id: z.string().regex(/^[A-Za-z0-9.-]{1,64}$/), treatmentId: z.string().regex(/^[A-Za-z0-9.-]{1,64}$/), patientId: z.string().regex(/^[A-Za-z0-9.-]{1,64}$/), ordinal: z.number().int().positive(), quota: z.number().int().optional(), frequency: z.string().max(240).optional(), phase: z.enum(["open", "report-pending", "reported", "closed"]), closure: z.enum(["quota", "partial"]).optional(), partialReason: z.string().max(2000).optional(), available: z.boolean(), clinicalRevision: z.number().int().nonnegative(),
});
export function mapFhirPeriod(resource: PeriodResource): TreatmentPeriod {
  const data = periodSchema.parse(JSON.parse(resource.extension.find(e => e.url === PERIOD_BASE)?.valueString ?? "null"));
  if (!data || data.id !== resource.id || resource.subject.reference !== `Patient/${data.patientId}` || !resource.supportingInfo.some(r => r.reference === `EpisodeOfCare/${data.treatmentId}`)) throw new Error("Período inconsistente.");
  return { ...data, currentReportId: resource.extension.find(e => e.url === `${PERIOD_BASE}-report`)?.valueReference?.reference.split("/").at(-1), version: resource.meta?.versionId };
}
export function periodEntry(period: TreatmentPeriod) {
  if (!period.version) throw new Error("Falta versión del período.");
  return { resource: mapPeriodToFhir(period), request: { method: "PUT" as const, url: `CarePlan/${period.id}`, ifMatch: `W/"${period.version}"` } };
}
