import { createFhirDailyRouteRepository } from "./route/fhir-daily-route.repository";
import { createFhirPeriodRepository } from "./periods/fhir-period.repository";
import { createFhirReportRepository } from "./periods/fhir-report.repository";
import { reportTools } from "../reports/report-tools";
import "server-only";

import { createFhirClient } from "./core/fhir.client";
import { readFhirConfig } from "./fhir.config";
import { createFhirPatientRepository } from "./patient/fhir-patient.repository";
import { createFhirTreatmentRepository } from "./episode-of-care/fhir-treatment.repository";
import { createFhirConditionRepository } from "./condition/fhir-condition.repository";
import { createFhirVisitRepository } from "./encounter/fhir-visit.repository";
import { createFhirMetricRepository } from "./observation/fhir-metric.repository";
import { createFhirScheduledVisitRepository } from "./appointment/fhir-scheduled-visit.repository";
import { createFhirClinicalWorkflowRepository } from "./encounter/fhir-clinical-workflow.repository";
import { createFhirClinicalEvaluationRepository } from "./observation/fhir-clinical-evaluation.repository";
import { createFhirClinicalSymptomRepository } from "./observation/fhir-clinical-symptom.repository";
import { createFhirPerformedProcedureRepository } from "./procedure/fhir-performed-procedure.repository";
import { createFhirClinicalAdministrationRepository } from "./administration/fhir-clinical-administration.repository";
import { createFhirConsultationRepository } from "./consultation/fhir-consultation.repository";
import { createFhirAgendaCoordinatorRepository } from "./appointment/fhir-agenda-coordinator.repository";

export function createClinicalDependencies() {
  const config = readFhirConfig();
  if (!config) throw new Error("La integración clínica no está configurada correctamente.");
  const client = createFhirClient({ baseUrl: config.baseUrl });
  const dependencies = {
    dailyRoutes: createFhirDailyRouteRepository(client),
    periods: createFhirPeriodRepository(client),
    reports: createFhirReportRepository(client),
    reportTools,
    patients: createFhirPatientRepository(client),
    treatments: createFhirTreatmentRepository(client),
    conditions: createFhirConditionRepository(client),
    visits: createFhirVisitRepository(client),
    metrics: createFhirMetricRepository(client),
    evaluations: createFhirClinicalEvaluationRepository(client),
    symptoms: createFhirClinicalSymptomRepository(client),
    procedures: createFhirPerformedProcedureRepository(client),
    scheduledVisits: createFhirScheduledVisitRepository(client),
    agendaCoordinator: createFhirAgendaCoordinatorRepository(client),
    workflow: createFhirClinicalWorkflowRepository(client),
    administration: createFhirClinicalAdministrationRepository(client),
    consultations: createFhirConsultationRepository(client),
  };
  return { ...dependencies, periodFlow: dependencies };
}
