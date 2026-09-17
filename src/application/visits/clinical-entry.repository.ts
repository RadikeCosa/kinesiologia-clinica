import type { ClinicalEvaluation, PerformedProcedure } from "@/domain/visit/clinical-entry";

export interface ClinicalEvaluationRepository {
  listByVisitId(visitId: string): Promise<ClinicalEvaluation[]>;
  listByPatientId(patientId: string): Promise<ClinicalEvaluation[]>;
  putIfAbsent(evaluation: ClinicalEvaluation): Promise<void>;
}

export interface PerformedProcedureRepository {
  listByVisitId(visitId: string): Promise<PerformedProcedure[]>;
  putIfAbsent(procedure: PerformedProcedure): Promise<void>;
}
