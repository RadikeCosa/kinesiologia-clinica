import { z } from "zod";

export const consultationStatusSchema = z.enum([
  "open", "coordinating", "evaluation-completed", "treatment-started", "closed",
]);
export type ConsultationStatus = z.infer<typeof consultationStatusSchema>;

export const consultationRoleSchema = z.enum([
  "requester", "coordination-contact", "budget-acceptor", "legal-representative", "authorized-recipient",
]);
export type ConsultationRole = z.infer<typeof consultationRoleSchema> | "patient" | "data-subject";

export interface ConsultationContact {
  id: string;
  name: string;
  relationship: string;
  roles: ConsultationRole[];
  representationBasis?: string;
  phone?: string;
}

export interface ConsultationEvidence {
  kind: "data-notice" | "clinical-consent" | "third-party-disclosure" | "third-party-disclosure-revocation" | "budget-acceptance";
  id?: string;
  subjectContactId: string;
  actorContactId: string;
  recipientContactId?: string;
  relatedEvidenceId?: string;
  capacity: string;
  at: string;
  method: "verbal" | "written" | "digital";
  scope: string;
  representationBasis?: string;
}

export interface ConsultationQuote {
  id: string;
  scope: "initial-evaluation" | "treatment";
  revision: number;
  amount: number;
  currency: string;
  modality: string;
  communicatedAt: string;
  status: "pending" | "accepted" | "rejected";
  supersededAt?: string;
  responseAt?: string;
  acceptedByContactId?: string;
}

export interface ConsultationFollowUp {
  id: string;
  dueAt: string;
  status: "pending" | "completed" | "cancelled";
  resultOrReason?: string;
  history: Array<{ at: string; event: "rescheduled" | "completed" | "cancelled"; detail?: string }>;
}

export interface Consultation {
  id: string;
  patientId: string;
  status: ConsultationStatus;
  initialContext?: { reason: string; source: "patient" | "family" | "professional" };
  contacts: ConsultationContact[];
  noticesAndConsents: ConsultationEvidence[];
  quotes: ConsultationQuote[];
  followUps: ConsultationFollowUp[];
  appointmentIds: string[];
  priorEvaluationId?: string;
  priorEvaluationReview?: { at: string; rationale: string };
  initialEvaluationId?: string;
  closeReason?: "no-response" | "quote-declined" | "withdrew" | "referred" | "other";
  closeNote?: string;
  treatmentId?: string;
  version?: string;
  createdAt: string;
  updatedAt?: string;
}

export function isActiveConsultationStatus(status: ConsultationStatus): boolean {
  return status === "open" || status === "coordinating" || status === "evaluation-completed";
}

export function acceptedQuote(consultation: Consultation, scope: ConsultationQuote["scope"]): ConsultationQuote | null {
  const current = consultation.quotes.filter((quote) => quote.scope === scope && !quote.supersededAt).sort((a, b) => b.revision - a.revision)[0];
  return current?.status === "accepted" ? current : null;
}
