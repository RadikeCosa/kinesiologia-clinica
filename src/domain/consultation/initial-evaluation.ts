import { z } from "zod";
import { visitClinicalEntriesSchema, type VisitClinicalEntriesInput } from "@/domain/visit/clinical-entry";

export const initialEvaluationInputSchema = z.object({
  operationId: z.uuid(),
  consultationId: z.string().regex(/^[A-Za-z0-9.-]{1,64}$/),
  appointmentId: z.string().regex(/^[A-Za-z0-9.-]{1,64}$/).optional(),
  startedAt: z.iso.datetime({ offset: true }),
  endedAt: z.iso.datetime({ offset: true }),
  reason: z.string().trim().min(1).max(2000),
  subjective: z.string().trim().max(4000).optional(),
  objective: z.string().trim().max(4000).optional(),
  assessment: z.string().trim().min(1).max(4000),
  goalsAndPlan: z.string().trim().max(3000).optional(),
  consentContactId: z.string().min(1),
  consentMethod: z.enum(["verbal", "written", "digital"]),
  consentAt: z.iso.datetime({ offset: true }),
  clinicalEntries: visitClinicalEntriesSchema.default({ evaluations: [], symptoms: [], procedures: [] }),
}).superRefine((value, context) => {
  if (new Date(value.endedAt) <= new Date(value.startedAt)) context.addIssue({ code: "custom", path: ["endedAt"], message: "La finalización debe ser posterior al inicio." });
});

export type InitialEvaluationInput = z.infer<typeof initialEvaluationInputSchema>;
export interface InitialEvaluation extends Omit<InitialEvaluationInput, "operationId" | "consentContactId" | "consentMethod" | "consentAt"> {
  id: string;
  patientId: string;
  recordedAt: string;
  version?: string;
}

export function createInitialEvaluation(input: InitialEvaluationInput, patientId: string, recordedAt: string): InitialEvaluation {
  return {
    id: `initial-evaluation-${input.operationId}`,
    patientId,
    consultationId: input.consultationId,
    appointmentId: input.appointmentId,
    startedAt: input.startedAt,
    endedAt: input.endedAt,
    reason: input.reason,
    subjective: input.subjective || undefined,
    objective: input.objective || undefined,
    assessment: input.assessment,
    goalsAndPlan: input.goalsAndPlan || undefined,
    clinicalEntries: input.clinicalEntries as VisitClinicalEntriesInput,
    recordedAt,
  };
}
