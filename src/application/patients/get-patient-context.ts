import type { PatientRepository } from "./patient.repository";
import type { TreatmentRepository } from "@/application/treatments/treatment.repository";
import type { ConditionRepository } from "@/application/conditions/condition.repository";
import { selectMostRecentTreatment } from "@/domain/treatment/treatment";

export async function getPatientContext(id: string, dependencies: {
  patients: PatientRepository;
  treatments: TreatmentRepository;
  conditions: ConditionRepository;
}) {
  if (!/^[A-Za-z0-9.-]{1,64}$/.test(id)) return null;
  const patient = await dependencies.patients.getById(id);
  if (!patient) return null;
  const treatment = selectMostRecentTreatment(
    (await dependencies.treatments.listActive()).filter((item) => item.patientId === id),
  );
  if (!treatment) return null;
  const diagnoses = await dependencies.conditions.listByIds(
    treatment.diagnosisReferences?.map((item) => item.conditionId) ?? [],
  );
  return {
    patient,
    treatment,
    diagnoses: (treatment.diagnosisReferences ?? []).flatMap((reference) => {
      const diagnosis = diagnoses.find((item) => item.id === reference.conditionId && item.patientId === id);
      return diagnosis ? [{ ...diagnosis, kind: reference.kind }] : [];
    }),
  };
}
