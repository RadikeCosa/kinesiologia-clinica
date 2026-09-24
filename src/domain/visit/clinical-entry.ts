import { z } from "zod";

export const evaluationDomains = ["joint-mobility", "strength", "gait-mobility", "transfers", "balance-falls", "respiratory-exertion", "environment-independence"] as const;
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
  if (evaluation.name.trim().toLocaleLowerCase() === "dolor nrs") {
    issue.addIssue({ code: "custom", path: ["name"], message: "El dolor se registra como síntoma." });
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
  status?: "final" | "corrected" | "entered-in-error";
  version?: string;
}

export const symptomCodes = ["pain", "tiredness", "drowsiness", "nausea", "lack-of-appetite", "shortness-of-breath", "depression", "anxiety", "custom"] as const;
export const symptomCodeSchema = z.enum(symptomCodes);
export type SymptomCode = z.infer<typeof symptomCodeSchema>;

const symptomContextSchema = z.object({
  bodySite: z.string().trim().max(100).optional(),
  laterality: z.enum(["left", "right", "bilateral"]).optional(),
  note: z.string().trim().max(300).optional(),
});

export const clinicalSymptomInputSchema = z.object({
  clientId: z.uuid(),
  seriesId: z.uuid(),
  code: symptomCodeSchema,
  name: z.string().trim().min(1).max(120).optional(),
  severity: z.number().int().min(0).max(10),
  context: symptomContextSchema.optional(),
}).superRefine((symptom, issue) => {
  if (symptom.code === "custom" && !symptom.name?.trim()) {
    issue.addIssue({ code: "custom", path: ["name"], message: "Escribí el nombre del síntoma." });
  }
  if (symptom.code !== "custom" && symptom.name !== undefined) {
    issue.addIssue({ code: "custom", path: ["name"], message: "El catálogo ya define el nombre de este síntoma." });
  }
});

export type ClinicalSymptomInput = z.infer<typeof clinicalSymptomInputSchema>;
export interface ClinicalSymptom extends ClinicalSymptomInput {
  id: string;
  patientId: string;
  visitId: string;
  effectiveDateTime: string;
  status?: "final" | "corrected" | "entered-in-error";
  version?: string;
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
  status?: "completed" | "entered-in-error";
  version?: string;
}

export const visitClinicalEntriesSchema = z.object({
  evaluations: z.array(clinicalEvaluationInputSchema).max(20).default([]),
  symptoms: z.array(clinicalSymptomInputSchema).max(20).default([]).superRefine((symptoms, issue) => {
    const keys = symptoms.map((symptom) => symptom.code === "custom" ? `custom:${symptom.name!.trim().toLocaleLowerCase()}` : symptom.code);
    if (new Set(keys).size !== keys.length) issue.addIssue({ code: "custom", message: "No se puede repetir un síntoma en la misma visita." });
  }),
  procedures: z.array(performedProcedureInputSchema).max(procedureFamilies.length).refine((items) => new Set(items.map((item) => item.family)).size === items.length, "No se puede repetir un procedimiento.").default([]),
});

export type VisitClinicalEntriesInput = z.infer<typeof visitClinicalEntriesSchema>;
