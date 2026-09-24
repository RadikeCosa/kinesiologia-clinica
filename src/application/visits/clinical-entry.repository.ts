import type { ClinicalEvaluation, ClinicalSymptom, PerformedProcedure } from "@/domain/visit/clinical-entry";

export interface ClinicalEvaluationRepository {
  listByVisitId(visitId: string): Promise<ClinicalEvaluation[]>;
  listByPatientId(patientId: string): Promise<ClinicalEvaluation[]>;
  putIfAbsent(evaluation: ClinicalEvaluation): Promise<void>;
}

export interface ClinicalSymptomRepository {
  listByVisitId(visitId: string): Promise<ClinicalSymptom[]>;
  listByPatientId(patientId: string): Promise<ClinicalSymptom[]>;
  putIfAbsent(symptom: ClinicalSymptom): Promise<void>;
}

export interface PerformedProcedureRepository {
  listByVisitId(visitId: string): Promise<PerformedProcedure[]>;
  putIfAbsent(procedure: PerformedProcedure): Promise<void>;
}
