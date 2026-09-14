import type { ConditionRepository } from "@/application/conditions/condition.repository";
import type { Diagnosis } from "@/domain/condition/condition";
import { readAllResourcesByType } from "@/infrastructure/fhir/core/fhir.bundle";
import type { FhirClient } from "@/infrastructure/fhir/core/fhir.client";
import { extractIdFromReference } from "@/infrastructure/fhir/core/fhir.references";
import type { FhirResource } from "@/infrastructure/fhir/core/fhir.types";

interface FhirCondition extends FhirResource {
  resourceType: "Condition";
  subject?: { reference?: string };
  code?: { text?: string };
  recordedDate?: string;
}

export function createFhirConditionRepository(client: FhirClient): ConditionRepository {
  return {
    async listByIds(ids) {
      const safeIds = [...new Set(ids.filter((id) => /^[A-Za-z0-9.-]{1,64}$/.test(id)))];
      if (!safeIds.length) return [];
      const query = new URLSearchParams({ _id: safeIds.join(","), _count: "200" });
      const resources = await readAllResourcesByType<FhirCondition>({
        client,
        path: `Condition?${query}`,
        resourceType: "Condition",
      });
      return resources.flatMap((resource): Diagnosis[] => {
        const id = resource.id?.trim();
        const patientId = extractIdFromReference(resource.subject?.reference);
        if (!id || !patientId) return [];
        return [{ id, patientId, text: resource.code?.text?.trim() ?? "", recordedAt: resource.recordedDate }];
      });
    },
  };
}
