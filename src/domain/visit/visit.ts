import { z } from "zod";

export const metricCodeSchema = z.enum([
  "tug_seconds", "pain_nrs_0_10", "standing_tolerance_minutes", "gait_duration_minutes",
]);

export type MetricCode = z.infer<typeof metricCodeSchema>;

export interface FunctionalMetric {
  id: string;
  patientId: string;
  visitId: string;
  code: MetricCode;
  value: number;
  effectiveDateTime: string;
  unit: string;
}

export interface ClinicalNote {
  subjective?: string;
  objective?: string;
  intervention?: string;
  assessment?: string;
  tolerance?: string;
  homeInstructions?: string;
  nextPlan?: string;
}

export interface Visit {
  id: string;
  patientId: string;
  treatmentId: string;
  status: "in-progress" | "finished";
  startedAt: string;
  endedAt?: string;
  captureMode?: "live" | "retrospective";
  recordedAt?: string;
  clinicalNote?: ClinicalNote;
}

export const createVisitSchema = z.object({
  clientVisitId: z.uuid(),
  patientId: z.string().regex(/^[A-Za-z0-9.-]{1,64}$/),
  treatmentId: z.string().regex(/^[A-Za-z0-9.-]{1,64}$/),
  startedAt: z.iso.datetime({ offset: true }),
  endedAt: z.iso.datetime({ offset: true }),
  captureMode: z.enum(["live", "retrospective"]),
  clinicalNote: z.object({
    subjective: z.string().trim().min(1).max(2000),
    intervention: z.string().trim().min(1).max(2000),
    assessment: z.string().trim().min(1).max(2000),
    nextPlan: z.string().trim().max(2000).optional(),
  }),
  metrics: z.array(z.object({ code: metricCodeSchema, value: z.number().finite().nonnegative() })).max(4).default([]),
}).superRefine((input, context) => {
  if (new Date(input.endedAt) < new Date(input.startedAt)) {
    context.addIssue({ code: "custom", path: ["endedAt"], message: "La salida debe ser posterior a la entrada." });
  }
  if (new Set(input.metrics.map((metric) => metric.code)).size !== input.metrics.length) {
    context.addIssue({ code: "custom", path: ["metrics"], message: "No se puede repetir una métrica." });
  }
  for (const metric of input.metrics) {
    if (metric.code === "pain_nrs_0_10" && metric.value > 10) {
      context.addIssue({ code: "custom", path: ["metrics"], message: "La escala de dolor va de 0 a 10." });
    }
  }
});

export type CreateVisitInput = z.infer<typeof createVisitSchema>;
