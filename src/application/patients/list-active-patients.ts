import type { PatientRepository } from "@/application/patients/patient.repository";
import type { TreatmentRepository } from "@/application/treatments/treatment.repository";
import { getPatientDisplayName } from "@/domain/patient/patient";
import {
  selectMostRecentTreatment,
  type Treatment,
} from "@/domain/treatment/treatment";

export interface ActivePatientListItem {
  id: string;
  displayName: string;
  phone?: string;
  treatment: {
    id: string;
    startDate: string;
  };
  dataQuality: {
    multipleActiveTreatments: boolean;
  };
}

function groupTreatmentsByPatient(
  treatments: Treatment[],
): Map<string, Treatment[]> {
  const grouped = new Map<string, Treatment[]>();

  for (const treatment of treatments) {
    const patientId = treatment.patientId.trim();
    if (!patientId) continue;

    const current = grouped.get(patientId) ?? [];
    current.push(treatment);
    grouped.set(patientId, current);
  }

  return grouped;
}

export async function listActivePatients(dependencies: {
  patients: Pick<PatientRepository, "listByIds">;
  treatments: Pick<TreatmentRepository, "listActive">;
}): Promise<ActivePatientListItem[]> {
  const activeTreatments = await dependencies.treatments.listActive();
  const treatmentsByPatient = groupTreatmentsByPatient(activeTreatments);
  const patientIds = [...treatmentsByPatient.keys()];

  if (!patientIds.length) {
    return [];
  }

  const patients = await dependencies.patients.listByIds(patientIds);

  return patients
    .flatMap((patient) => {
      const treatments = treatmentsByPatient.get(patient.id) ?? [];
      const treatment = selectMostRecentTreatment(treatments);

      if (!treatment) return [];

      return [
        {
          id: patient.id,
          displayName: getPatientDisplayName(patient),
          phone: patient.phone,
          treatment: {
            id: treatment.id,
            startDate: treatment.startDate,
          },
          dataQuality: {
            multipleActiveTreatments: treatments.length > 1,
          },
        },
      ];
    })
    .sort((first, second) =>
      first.displayName.localeCompare(second.displayName, "es", {
        sensitivity: "base",
      }),
    );
}
