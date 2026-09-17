import type { ClinicalWorkflowRepository } from "@/application/visits/clinical-workflow.repository";
import type { ScheduledVisit } from "@/domain/schedule/scheduled-visit";
import type { FunctionalMetric, Visit } from "@/domain/visit/visit";
import type { FhirClient } from "@/infrastructure/fhir/core/fhir.client";
import { mapScheduledVisitToFhir } from "@/infrastructure/fhir/appointment/appointment.mapper";
import { mapMetricToFhir } from "@/infrastructure/fhir/observation/fhir-metric.repository";
import type { ClinicalEvaluation, PerformedProcedure } from "@/domain/visit/clinical-entry";
import { mapClinicalEvaluationToFhir } from "@/infrastructure/fhir/observation/clinical-evaluation.mapper";
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
  return { resource: mapMetricToFhir(metric), request: { method: "PUT", url: `Observation/${metric.id}` } };
}
function evaluationEntry(value: ClinicalEvaluation): TransactionEntry { return { resource: mapClinicalEvaluationToFhir(value), request: { method: "PUT", url: `Observation/${value.id}` } }; }
function procedureEntry(value: PerformedProcedure): TransactionEntry { return { resource: mapPerformedProcedureToFhir(value), request: { method: "PUT", url: `Procedure/${value.id}` } }; }

export function createFhirClinicalWorkflowRepository(client: FhirClient): ClinicalWorkflowRepository {
  async function transact(entries: TransactionEntry[]) {
    await client.transaction({ resourceType: "Bundle", type: "transaction", entry: entries });
  }
  return {
    start: (visit, appointment) => transact([visitEntry(visit), ...(appointment ? [appointmentEntry(appointment)] : [])]),
    annul: (visit, appointment) => transact([visitEntry(visit), ...(appointment ? [appointmentEntry(appointment)] : [])]),
    finish: (visit, metrics, evaluations, procedures) => transact([visitEntry(visit), ...metrics.map(metricEntry), ...evaluations.map(evaluationEntry), ...procedures.map(procedureEntry)]),
    completeRetrospective: (visit, metrics, evaluations, procedures, appointment) => transact([visitEntry(visit), ...metrics.map(metricEntry), ...evaluations.map(evaluationEntry), ...procedures.map(procedureEntry), ...(appointment ? [appointmentEntry(appointment)] : [])]),
  };
}
