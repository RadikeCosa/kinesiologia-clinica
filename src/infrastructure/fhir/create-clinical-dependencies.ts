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
import { createFhirPerformedProcedureRepository } from "./procedure/fhir-performed-procedure.repository";

export function createClinicalDependencies() {
  const config = readFhirConfig();
  if (!config) throw new Error("La integración clínica no está configurada correctamente.");
  const client = createFhirClient({ baseUrl: config.baseUrl });
  return {
    patients: createFhirPatientRepository(client),
    treatments: createFhirTreatmentRepository(client),
    conditions: createFhirConditionRepository(client),
    visits: createFhirVisitRepository(client),
    metrics: createFhirMetricRepository(client),
    evaluations: createFhirClinicalEvaluationRepository(client),
    procedures: createFhirPerformedProcedureRepository(client),
    scheduledVisits: createFhirScheduledVisitRepository(client),
    workflow: createFhirClinicalWorkflowRepository(client),
  };
}
