import type { ActivePatientListItem } from "@/application/patients/list-active-patients";

export interface ActivePatientListViewItem extends ActivePatientListItem {
  treatmentStartLabel: string;
}

export function presentActivePatients(
  patients: ActivePatientListItem[],
): ActivePatientListViewItem[] {
  return patients.map((patient) => ({
    ...patient,
    treatmentStartLabel: new Intl.DateTimeFormat("es-AR", {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(`${patient.treatment.startDate}T00:00:00.000Z`)),
  }));
}
