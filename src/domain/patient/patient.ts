export interface Patient {
  id: string;
  givenName: string;
  familyName: string;
  phone?: string;
  address?: string;
  accessInstructions?: string;
  updatedAt?: string;
}

export function getPatientDisplayName(
  patient: Pick<Patient, "givenName" | "familyName">,
): string {
  return [patient.givenName, patient.familyName]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(" ");
}
