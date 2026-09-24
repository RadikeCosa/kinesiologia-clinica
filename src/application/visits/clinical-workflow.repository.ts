import type { ScheduledVisit } from "@/domain/schedule/scheduled-visit";
import type { FunctionalMetric, Visit } from "@/domain/visit/visit";
import type { ClinicalEvaluation, ClinicalSymptom, PerformedProcedure } from "@/domain/visit/clinical-entry";

export interface ClinicalWorkflowRepository {
  start(visit: Visit, appointment?: ScheduledVisit): Promise<void>;
  annul(visit: Visit, appointment?: ScheduledVisit): Promise<void>;
  finish(visit: Visit, metrics: FunctionalMetric[], evaluations: ClinicalEvaluation[], procedures: PerformedProcedure[], symptoms?: ClinicalSymptom[]): Promise<void>;
  completeRetrospective(visit: Visit, metrics: FunctionalMetric[], evaluations: ClinicalEvaluation[], procedures: PerformedProcedure[], appointment?: ScheduledVisit, symptoms?: ClinicalSymptom[]): Promise<void>;
  correct(visit: Visit, metrics: FunctionalMetric[], evaluations: ClinicalEvaluation[], procedures: PerformedProcedure[], symptoms?: ClinicalSymptom[]): Promise<void>;
  annulFinished(visit: Visit, metrics: FunctionalMetric[], evaluations: ClinicalEvaluation[], procedures: PerformedProcedure[], appointment?: ScheduledVisit, symptoms?: ClinicalSymptom[]): Promise<void>;
}
