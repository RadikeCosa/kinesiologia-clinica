import { z } from "zod";
import { consultationStatusSchema } from "@/domain/consultation/consultation";
import { initialEvaluationInputSchema } from "@/domain/consultation/initial-evaluation";
const id = z.string().regex(/^[A-Za-z0-9.-]{1,64}$/);
const localId = z.string().min(1).max(240);
const at = z.iso.datetime({ offset: true });
const optionalText = z.string().optional();
const contact = z.object({ id: localId, name: z.string(), relationship: z.string(), roles: z.array(z.enum(["requester", "coordination-contact", "budget-acceptor", "legal-representative", "authorized-recipient", "patient", "data-subject"])), representationBasis: optionalText, phone: optionalText });
const evidence = z.object({ kind: z.enum(["data-notice", "clinical-consent", "third-party-disclosure", "third-party-disclosure-revocation", "budget-acceptance"]), id: localId.optional(), subjectContactId: localId, actorContactId: localId, recipientContactId: localId.optional(), relatedEvidenceId: localId.optional(), capacity: z.string(), at, method: z.enum(["verbal", "written", "digital"]), scope: z.string(), representationBasis: optionalText });
export const consultationDataV1 = z.object({
 id, patientId: id, status: consultationStatusSchema,
 initialContext: z.object({ reason: z.string(), source: z.enum(["patient", "family", "professional"]) }).optional(),
 contacts: z.array(contact), noticesAndConsents: z.array(evidence),
 quotes: z.array(z.object({ id: localId, scope: z.enum(["initial-evaluation", "treatment"]), revision: z.number().int().positive(), amount: z.number().finite().nonnegative(), currency: z.string(), modality: z.string(), communicatedAt: at, status: z.enum(["pending", "accepted", "rejected"]), supersededAt: at.optional(), responseAt: at.optional(), acceptedByContactId: localId.optional() })),
 followUps: z.array(z.object({ id: localId, dueAt: at, status: z.enum(["pending", "completed", "cancelled"]), resultOrReason: optionalText, history: z.array(z.object({ at, event: z.enum(["rescheduled", "completed", "cancelled"]), detail: optionalText })) })),
 appointmentIds: z.array(id), priorEvaluationId: id.optional(), priorEvaluationReview: z.object({ at, rationale: z.string() }).optional(), initialEvaluationId: id.optional(), closeReason: z.enum(["no-response", "quote-declined", "withdrew", "referred", "other"]).optional(), closeNote: optionalText, treatmentId: id.optional(), createdAt: at,
}).strict();
export const appointmentDataV1 = z.object({ id, consultationId: id, patientId: id, status: z.enum(["proposed", "confirmed", "realized", "cancelled", "not-performed"]), scheduledDate: z.iso.date(), startsAt: at.optional(), endsAt: at.optional(), durationMinutes: z.number().int().positive().optional(), createdAt: at, replacesId: id.optional(), replacedById: id.optional(), reason: z.enum(["patient-or-family", "professional", "health-event", "logistics-or-weather", "other"]).optional(), note: optionalText }).strict().superRefine((v,c) => {
 if (Boolean(v.startsAt) !== Boolean(v.endsAt) || v.startsAt && v.endsAt && new Date(v.endsAt) <= new Date(v.startsAt) || v.status === "confirmed" && !v.startsAt) c.addIssue({code:"custom",message:"Cita inconsistente."});
});
export const evaluationDataV1 = z.object({ ...initialEvaluationInputSchema.shape, id, patientId: id, recordedAt: at }).omit({ operationId: true, consentContactId: true, consentMethod: true, consentAt: true }).strict().superRefine((v,c) => {
 if (new Date(v.endedAt) <= new Date(v.startedAt)) c.addIssue({code:"custom",message:"Evaluación inconsistente."});
});
export class ClinicalDataContractError extends Error {
 constructor() { super("El registro clínico tiene un formato incompatible o relaciones inconsistentes. No se guardaron cambios. Revisá el registro antes de continuar."); }
}
/** The URL defines v1. Missing schemaVersion is the supported historical v1 format. */
export function readDataV1<T>(extensions: Array<{ url?: string; valueString?: string }> | undefined, url: string, schema: z.ZodType<T>): T | null {
 const family = url.replace(/v1$/, "");
 const recognized = extensions?.filter(e => e.url?.startsWith(family)) ?? [];
 if (!recognized.length) return null; // resource belongs to a different workflow
 if (recognized.length !== 1 || recognized[0].url !== url || !recognized[0].valueString) throw new ClinicalDataContractError();
 try {
  const raw: unknown = JSON.parse(recognized[0].valueString);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error();
  const version = (raw as { schemaVersion?: unknown }).schemaVersion;
  if (version !== undefined && version !== 1) throw new Error();
  return schema.parse(Object.fromEntries(Object.entries(raw).filter(([key]) => !["schemaVersion", "version", "updatedAt"].includes(key))));
 } catch { throw new ClinicalDataContractError(); }
}
