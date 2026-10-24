import { buenosAiresDate } from "@/domain/route/daily-route";
import { notFound } from "next/navigation";
import { getClinicalHome } from "@/application/home/get-clinical-home";
import { requireClinicalSession } from "@/infrastructure/auth/auth-http";
import { createClinicalDependencies } from "@/infrastructure/fhir/create-clinical-dependencies";
import { canRenderLocalClinicalSurface } from "@/infrastructure/runtime/local-clinical-surface";
import { SessionRefresh } from "@/app/patients/session-refresh";
import { ClinicalHome } from "./clinical-home";

export const dynamic = "force-dynamic";

export default async function ClinicalHomePage({ searchParams }: { searchParams: Promise<{ vista?: string; agendar?: string; resolver?: string; mes?: string; fecha?: string; pendientes?: string; semana?: string }> }) {
  if (!canRenderLocalClinicalSurface()) notFound();
  await requireClinicalSession();
  const { vista, agendar, resolver, mes, fecha, pendientes, semana } = await searchParams;
  const initialTab = vista === "agenda" ? "agenda" : vista === "pacientes" ? "patients" : "today";
  const data = await getClinicalHome(new Date(), createClinicalDependencies(), mes, semana);
  return <><SessionRefresh /><ClinicalHome key={`${data.agendaMonth}:${buenosAiresDate(new Date(data.referenceNow))}`} data={data} initialTab={initialTab} initialPatientId={agendar} initialResolveAppointmentId={resolver} initialSelectedDate={fecha} initialWeekStart={semana} initialShowPending={pendientes === "1"} /></>;
}
