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
  const treatments = dependencies.treatments.listByPatientId ? await dependencies.treatments.listByPatientId(id) : (await dependencies.treatments.listDirectory()).filter((item) => item.patientId === id);
  const treatment = selectMostRecentTreatment(treatments.filter((item) => item.status === "active")) ?? selectMostRecentTreatment(treatments);
  const diagnoses = await dependencies.conditions.listByIds(
    treatment?.diagnosisReferences?.map((item) => item.conditionId) ?? [],
  );
  return {
    patient,
    treatment,
    treatments,
    diagnoses: (treatment?.diagnosisReferences ?? []).flatMap((reference) => {
      const diagnosis = diagnoses.find((item) => item.id === reference.conditionId && item.patientId === id);
      return diagnosis ? [{ ...diagnosis, kind: reference.kind }] : [];
    }),
  };
}
