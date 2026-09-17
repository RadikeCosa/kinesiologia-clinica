import { z } from "zod";

export const evaluationDomains = ["pain-symptoms", "joint-mobility", "strength", "gait-mobility", "transfers", "balance-falls", "respiratory-exertion", "environment-independence"] as const;
export const evaluationDomainSchema = z.enum(evaluationDomains);
export type EvaluationDomain = z.infer<typeof evaluationDomainSchema>;

export const absentReasons = ["not-relevant", "deferred", "not-tolerated", "unsafe-contraindicated", "refused"] as const;
export const absentReasonSchema = z.enum(absentReasons);
export type EvaluationAbsentReason = z.infer<typeof absentReasonSchema>;

const contextSchema = z.object({
  bodySite: z.string().trim().max(100).optional(),
  laterality: z.enum(["left", "right", "bilateral"]).optional(),
  method: z.string().trim().max(120).optional(),
  assistanceDevice: z.string().trim().max(200).optional(),
  conditions: z.string().trim().max(300).optional(),
  interpretation: z.string().trim().max(500).optional(),
});

const resultSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("quantity"), value: z.number().finite(), unit: z.string().trim().max(30).optional() }),
  z.object({ kind: z.literal("coded"), value: z.string().trim().min(1).max(120) }),
  z.object({ kind: z.literal("boolean"), value: z.boolean() }),
  z.object({ kind: z.literal("narrative"), value: z.string().trim().min(1).max(500) }),
  z.object({ kind: z.literal("absent"), reason: absentReasonSchema, note: z.string().trim().max(300).optional() }),
]);

export const clinicalEvaluationInputSchema = z.object({
  clientId: z.uuid(),
  seriesId: z.uuid(),
  domain: evaluationDomainSchema,
  name: z.string().trim().min(1).max(120),
  result: resultSchema,
  context: contextSchema.optional(),
}).superRefine((evaluation, issue) => {
  if (evaluation.name === "Dolor NRS" && (evaluation.result.kind !== "quantity" || evaluation.result.value < 0 || evaluation.result.value > 10)) {
    issue.addIssue({ code: "custom", path: ["result"], message: "Dolor NRS debe estar entre 0 y 10." });
  }
});

export type ClinicalEvaluationInput = z.infer<typeof clinicalEvaluationInputSchema>;
export interface ClinicalEvaluation extends Omit<ClinicalEvaluationInput, "clientId" | "seriesId"> {
  id: string;
  clientId: string;
  seriesId: string;
  patientId: string;
  visitId: string;
  effectiveDateTime: string;
}

export const procedureFamilies = ["therapeutic-exercise", "manual-therapy", "gait-transfers", "respiratory", "education-instructions", "environment-assistive-devices", "other"] as const;
export const procedureFamilySchema = z.enum(procedureFamilies);
export type ProcedureFamily = z.infer<typeof procedureFamilySchema>;
export const performedProcedureInputSchema = z.object({
  family: procedureFamilySchema,
  otherName: z.string().trim().max(100).optional(),
}).superRefine((procedure, issue) => {
  if (procedure.family === "other" && !procedure.otherName) issue.addIssue({ code: "custom", path: ["otherName"], message: "Escribí el nombre del otro procedimiento." });
});
export type PerformedProcedureInput = z.infer<typeof performedProcedureInputSchema>;
export interface PerformedProcedure extends PerformedProcedureInput {
  id: string;
  patientId: string;
  visitId: string;
  performedStart: string;
  performedEnd: string;
}

export const visitClinicalEntriesSchema = z.object({
  evaluations: z.array(clinicalEvaluationInputSchema).max(20).default([]),
  procedures: z.array(performedProcedureInputSchema).max(procedureFamilies.length).refine((items) => new Set(items.map((item) => item.family)).size === items.length, "No se puede repetir un procedimiento.").default([]),
});

export type VisitClinicalEntriesInput = z.infer<typeof visitClinicalEntriesSchema>;
