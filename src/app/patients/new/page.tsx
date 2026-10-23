import { ClinicalEnvironmentLabel } from "@/app/clinical-environment";
import { notFound } from "next/navigation";
import { requireClinicalSession } from "@/infrastructure/auth/auth-http";
import { canRenderLocalClinicalSurface } from "@/infrastructure/runtime/local-clinical-surface";
import { PatientForm } from "./patient-form";

export default async function NewPatientPage() {
  if (!canRenderLocalClinicalSurface()) notFound(); await requireClinicalSession();
  return <main className="shell clinical-shell patient-admin-shell"><p className="eyebrow">{<ClinicalEnvironmentLabel/>}</p><h1>Nuevo paciente</h1><p className="lede">Creá primero la ficha de contacto. El tratamiento se inicia después, desde su ficha.</p><PatientForm /></main>;
}
