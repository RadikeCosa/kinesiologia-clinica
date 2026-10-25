import type { ClinicalWorkflowRepository, VisitWorkflow } from "./clinical-workflow.repository";
import { prepareVisitPeriod } from "../periods/guard-visit-period";

/** Application orchestration; adapters only commit the prepared state and its versions. */
export function createClinicalWorkflow(repository: ClinicalWorkflowRepository, ports: Parameters<typeof prepareVisitPeriod>[2]): VisitWorkflow {
  async function prepare(visit: Parameters<VisitWorkflow["start"]>[0], operation: "admit" | "change") {
    const prepared = await prepareVisitPeriod(visit, operation, ports);
    return { ...prepared.visit, preparedPeriod: prepared.period };
  }
  return {
    start: async (visit, appointment) => repository.start(await prepare(visit, "admit"), appointment),
    annul: async (visit, appointment) => repository.annul(await prepare(visit, "change"), appointment),
    finish: async (visit, ...entries) => repository.finish(await prepare(visit, "change"), ...entries),
    completeRetrospective: async (visit, ...entries) => repository.completeRetrospective(await prepare(visit, "admit"), ...entries),
    correct: async (visit, ...entries) => repository.correct(await prepare(visit, "change"), ...entries),
    annulFinished: async (visit, ...entries) => repository.annulFinished(await prepare(visit, "change"), ...entries),
  };
}
