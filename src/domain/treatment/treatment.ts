export interface Treatment {
  id: string;
  patientId: string;
  status: "active" | "finished";
  startDate: string;
  endDate?: string;
  clinicalContext?: {
    initialFunctionalStatus?: string;
    therapeuticGoals?: string;
    frameworkPlan?: string;
  };
  diagnosisReferences?: Array<{
    kind: "medical_reference" | "kinesiologic_diagnosis";
    conditionId: string;
  }>;
}

function toSafeTimestamp(value: string): number | null {
  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? null : timestamp;
}

export function selectMostRecentTreatment(
  treatments: Treatment[],
): Treatment | null {
  if (!treatments.length) {
    return null;
  }

  return treatments.reduce((latest, current) => {
    const latestTimestamp = toSafeTimestamp(latest.startDate);
    const currentTimestamp = toSafeTimestamp(current.startDate);

    if (currentTimestamp === null) return latest;
    if (latestTimestamp === null) return current;
    return currentTimestamp > latestTimestamp ? current : latest;
  });
}
