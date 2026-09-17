import type { Patient } from "@/domain/patient/patient";
import type { FhirPatient } from "./patient.fhir";

function readName(patient: FhirPatient): Pick<Patient, "givenName" | "familyName"> {
  const name = patient.name?.[0];
  const givenName =
    name?.given?.map((part) => part.trim()).filter(Boolean).join(" ") || "";
  const familyName = name?.family?.trim() || "";

  if (givenName || familyName) {
    return { givenName, familyName };
  }

  return {
    givenName: name?.text?.trim() || "",
    familyName: "",
  };
}

export function mapFhirPatient(patient: FhirPatient): Patient {
  const name = readName(patient);

  return {
    id: patient.id?.trim() || "",
    ...name,
    phone:
      patient.telecom
        ?.find((entry) => entry.system === "phone")
        ?.value?.trim() || undefined,
    address: patient.address?.[0]?.text?.trim() || undefined,
    accessInstructions: patient.extension?.find((entry) => entry.url === "https://kinesiologiaadomicilio.local/fhir/StructureDefinition/patient-home-access-instructions-v1")?.valueString?.trim() || undefined,
    updatedAt: patient.meta?.lastUpdated?.trim() || undefined,
  };
}
