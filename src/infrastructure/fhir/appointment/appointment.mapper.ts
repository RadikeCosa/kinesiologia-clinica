import type {
  ScheduleChangeReason,
  ScheduledVisit,
  ScheduledVisitStatus,
} from "@/domain/schedule/scheduled-visit";
import { nextLocalDate, toBuenosAiresInstant } from "@/domain/schedule/scheduled-visit";
import { extractIdFromReference } from "@/infrastructure/fhir/core/fhir.references";
import type { FhirResource } from "@/infrastructure/fhir/core/fhir.types";

const BASE = "https://kinesiologiaadomicilio.local/fhir/StructureDefinition/";
export const REPLACES_URL = `${BASE}appointment-replaces-v1`;
export const REPLACED_BY_URL = `${BASE}appointment-replaced-by-v1`;
export const CHANGE_REASON_URL = `${BASE}appointment-change-reason-v1`;
export const CHANGE_REASON_SYSTEM = "https://kinesiologiaadomicilio.local/fhir/CodeSystem/appointment-change-reason-v1";

interface FhirReference { reference?: string }
interface FhirExtension { url?: string; valueReference?: FhirReference; valueCode?: string }

export interface FhirAppointment extends FhirResource {
  resourceType: "Appointment";
  status: Exclude<ScheduledVisitStatus, "no-show"> | "noshow";
  start?: string;
  end?: string;
  minutesDuration?: number;
  created?: string;
  requestedPeriod?: Array<{ start?: string; end?: string }>;
  participant?: Array<{ actor?: FhirReference; status?: string }>;
  supportingInformation?: FhirReference[];
  extension?: FhirExtension[];
  cancelationReason?: {
    coding?: Array<{ system?: string; code?: string }>;
    text?: string;
  };
  serviceType?: Array<{ text?: string }>;
}

function localDateFromInstant(value: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date(value));
  const read = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return `${read("year")}-${read("month")}-${read("day")}`;
}

function isReason(value?: string): value is ScheduleChangeReason {
  return ["patient-or-family", "professional", "health-event", "logistics-or-weather", "other"].includes(value ?? "");
}

export function mapFhirAppointment(resource: FhirAppointment): ScheduledVisit | null {
  const patientId = extractIdFromReference(resource.participant?.find((item) => item.actor?.reference?.startsWith("Patient/"))?.actor?.reference);
  const treatmentId = extractIdFromReference(resource.supportingInformation?.find((item) => item.reference?.startsWith("EpisodeOfCare/"))?.reference);
  const requestedStart = resource.requestedPeriod?.[0]?.start;
  const scheduledDate = resource.start ? localDateFromInstant(resource.start) : requestedStart ? localDateFromInstant(requestedStart) : "";
  if (!resource.id || !patientId || !treatmentId || !scheduledDate) return null;
  const reasonCode = resource.extension?.find((item) => item.url === CHANGE_REASON_URL)?.valueCode
    ?? resource.cancelationReason?.coding?.find((item) => item.system === CHANGE_REASON_SYSTEM)?.code;
  const replacesId = extractIdFromReference(resource.extension?.find((item) => item.url === REPLACES_URL)?.valueReference?.reference);
  const replacedById = extractIdFromReference(resource.extension?.find((item) => item.url === REPLACED_BY_URL)?.valueReference?.reference);
  return {
    id: resource.id,
    patientId,
    treatmentId,
    status: resource.status === "noshow" ? "no-show" : resource.status,
    scheduledDate,
    startsAt: resource.start,
    endsAt: resource.end,
    durationMinutes: resource.minutesDuration,
    createdAt: resource.created ?? resource.meta?.lastUpdated ?? "",
    ...(resource.meta?.lastUpdated ? { updatedAt: resource.meta.lastUpdated } : {}),
    changeReason: isReason(reasonCode) ? reasonCode : undefined,
    changeNote: resource.cancelationReason?.text?.trim() || undefined,
    replacesId,
    replacedById,
    version: resource.meta?.versionId,
  };
}

export function mapScheduledVisitToFhir(visit: ScheduledVisit): FhirAppointment {
  const extension: FhirExtension[] = [];
  if (visit.replacesId) extension.push({ url: REPLACES_URL, valueReference: { reference: `Appointment/${visit.replacesId}` } });
  if (visit.replacedById) extension.push({ url: REPLACED_BY_URL, valueReference: { reference: `Appointment/${visit.replacedById}` } });
  if (visit.replacedById && visit.changeReason) extension.push({ url: CHANGE_REASON_URL, valueCode: visit.changeReason });
  const closed = visit.status === "cancelled" || visit.status === "no-show";
  return {
    resourceType: "Appointment",
    id: visit.id,
    status: visit.status === "no-show" ? "noshow" : visit.status,
    ...(visit.startsAt && visit.endsAt ? { start: visit.startsAt, end: visit.endsAt, minutesDuration: visit.durationMinutes } : {
      requestedPeriod: [{
        start: toBuenosAiresInstant(visit.scheduledDate, "00:00"),
        end: toBuenosAiresInstant(nextLocalDate(visit.scheduledDate), "00:00"),
      }],
    }),
    created: visit.createdAt,
    participant: [{ actor: { reference: `Patient/${visit.patientId}` }, status: "accepted" }],
    supportingInformation: [{ reference: `EpisodeOfCare/${visit.treatmentId}` }],
    serviceType: [{ text: "Kinesiología domiciliaria" }],
    ...(extension.length ? { extension } : {}),
    ...(closed ? {
      cancelationReason: {
        coding: [{ system: CHANGE_REASON_SYSTEM, code: visit.replacedById ? "rescheduled" : visit.changeReason }],
        ...(visit.changeNote ? { text: visit.changeNote } : {}),
      },
    } : {}),
  };
}
