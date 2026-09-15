import { notFound } from "next/navigation";
import { requireClinicalSession } from "@/infrastructure/auth/auth-http";
import { isClinicalHomeLabEnabled } from "@/domain/system/clinical-home-lab-policy";
import { getClinicalHomeScenario } from "@/features/clinical-home/clinical-home.scenarios";
import { ClinicalHomeLab } from "./clinical-home-lab";

export const dynamic = "force-dynamic";

export default async function ClinicalHomeLabPage({
  searchParams,
}: {
  searchParams: Promise<{ scenario?: string }>;
}) {
  if (!isClinicalHomeLabEnabled(process.env)) notFound();
  await requireClinicalSession();
  const { scenario } = await searchParams;
  return <ClinicalHomeLab initialScenarioId={getClinicalHomeScenario(scenario).id} />;
}
