import { notFound } from "next/navigation";
import { getClinicalHome } from "@/application/home/get-clinical-home";
import { requireClinicalSession } from "@/infrastructure/auth/auth-http";
import { createClinicalDependencies } from "@/infrastructure/fhir/create-clinical-dependencies";
import { canRenderLocalClinicalSurface } from "@/infrastructure/runtime/local-clinical-surface";
import { SessionRefresh } from "@/app/patients/session-refresh";
import { ClinicalHome } from "./clinical-home";

export const dynamic = "force-dynamic";

export default async function ClinicalHomePage({ searchParams }: { searchParams: Promise<{ vista?: string; agendar?: string; mes?: string; fecha?: string }> }) {
  if (!canRenderLocalClinicalSurface()) notFound();
  await requireClinicalSession();
  const { vista, agendar, mes, fecha } = await searchParams;
  const initialTab = vista === "agenda" ? "agenda" : vista === "pacientes" ? "patients" : "today";
  const data = await getClinicalHome(new Date(), createClinicalDependencies(), mes);
  return <><SessionRefresh /><ClinicalHome key={data.agendaMonth} data={data} initialTab={initialTab} initialPatientId={agendar} initialSelectedDate={fecha} /></>;
}
