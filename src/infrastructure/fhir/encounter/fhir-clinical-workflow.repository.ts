import { prepareVisitPeriod } from "@/application/periods/guard-visit-period";
import { createFhirPeriodRepository } from "../periods/fhir-period.repository";
import { createFhirTreatmentRepository } from "../episode-of-care/fhir-treatment.repository";
import { createFhirVisitRepository } from "./fhir-visit.repository";
import { periodEntry } from "../periods/period.mapper";
import type { ClinicalWorkflowRepository } from "@/application/visits/clinical-workflow.repository";
import type { ScheduledVisit } from "@/domain/schedule/scheduled-visit";
import type { FunctionalMetric, Visit } from "@/domain/visit/visit";
import type { FhirClient } from "@/infrastructure/fhir/core/fhir.client";
import { mapScheduledVisitToFhir } from "@/infrastructure/fhir/appointment/appointment.mapper";
import { mapMetricToFhir } from "@/infrastructure/fhir/observation/fhir-metric.repository";
import type { ClinicalEvaluation, ClinicalSymptom, PerformedProcedure } from "@/domain/visit/clinical-entry";
import { mapClinicalEvaluationToFhir } from "@/infrastructure/fhir/observation/clinical-evaluation.mapper";
import { mapClinicalSymptomToFhir } from "@/infrastructure/fhir/observation/clinical-symptom.mapper";
import { mapPerformedProcedureToFhir } from "@/infrastructure/fhir/procedure/procedure.mapper";
import { mapVisitToFhir } from "./encounter.mapper";

type TransactionEntry = { resource: unknown; request: { method: "PUT"; url: string; ifMatch?: string } };

function version(value?: string) { return value ? `W/\"${value}\"` : undefined; }
function visitEntry(visit: Visit): TransactionEntry {
  return { resource: mapVisitToFhir(visit), request: { method: "PUT", url: `Encounter/${visit.id}`, ...(version(visit.version) ? { ifMatch: version(visit.version) } : {}) } };
}
function appointmentEntry(appointment: ScheduledVisit): TransactionEntry {
  return { resource: mapScheduledVisitToFhir(appointment), request: { method: "PUT", url: `Appointment/${appointment.id}`, ...(version(appointment.version) ? { ifMatch: version(appointment.version) } : {}) } };
}
function metricEntry(metric: FunctionalMetric): TransactionEntry {
  return { resource: mapMetricToFhir(metric), request: { method: "PUT", url: `Observation/${metric.id}`, ...(version(metric.version) ? { ifMatch: version(metric.version) } : {}) } };
}
function evaluationEntry(value: ClinicalEvaluation): TransactionEntry { return { resource: mapClinicalEvaluationToFhir(value), request: { method: "PUT", url: `Observation/${value.id}`, ...(version(value.version) ? { ifMatch: version(value.version) } : {}) } }; }
function symptomEntry(value: ClinicalSymptom): TransactionEntry { return { resource: mapClinicalSymptomToFhir(value), request: { method: "PUT", url: `Observation/${value.id}`, ...(version(value.version) ? { ifMatch: version(value.version) } : {}) } }; }
function procedureEntry(value: PerformedProcedure): TransactionEntry { return { resource: mapPerformedProcedureToFhir(value), request: { method: "PUT", url: `Procedure/${value.id}`, ...(version(value.version) ? { ifMatch: version(value.version) } : {}) } }; }

export function createFhirClinicalWorkflowRepository(client: FhirClient): ClinicalWorkflowRepository {
  const ports = { periods: createFhirPeriodRepository(client), treatments: createFhirTreatmentRepository(client), visits: createFhirVisitRepository(client) };
  async function transact(visit: Visit, operation: "admit" | "change", entries: TransactionEntry[]) {
    const prepared = await prepareVisitPeriod(visit, operation, ports);
    await client.transaction({ resourceType: "Bundle", type: "transaction", entry: [periodEntry(prepared.period), visitEntry(prepared.visit), ...entries] });
  }
  return {
    start: (visit, appointment) => transact(visit, "admit", [ ...(appointment ? [appointmentEntry(appointment)] : [])]),
    annul: (visit, appointment) => transact(visit, "change", [ ...(appointment ? [appointmentEntry(appointment)] : [])]),
    finish: (visit, metrics, evaluations, procedures, symptoms = []) => transact(visit, "change", [ ...metrics.map(metricEntry), ...evaluations.map(evaluationEntry), ...procedures.map(procedureEntry), ...symptoms.map(symptomEntry)]),
    completeRetrospective: (visit, metrics, evaluations, procedures, appointment, symptoms = []) => transact(visit, "admit", [ ...metrics.map(metricEntry), ...evaluations.map(evaluationEntry), ...procedures.map(procedureEntry), ...symptoms.map(symptomEntry), ...(appointment ? [appointmentEntry(appointment)] : [])]),
    correct: (visit, metrics, evaluations, procedures, symptoms = []) => transact(visit, "change", [ ...metrics.map(metricEntry), ...evaluations.map(evaluationEntry), ...procedures.map(procedureEntry), ...symptoms.map(symptomEntry)]),
    annulFinished: (visit, metrics, evaluations, procedures, appointment, symptoms = []) => transact(visit, "change", [ ...metrics.map(metricEntry), ...evaluations.map(evaluationEntry), ...procedures.map(procedureEntry), ...symptoms.map(symptomEntry), ...(appointment ? [appointmentEntry(appointment)] : [])]),
  };
}
