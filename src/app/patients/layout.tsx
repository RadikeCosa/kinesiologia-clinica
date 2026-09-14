import type { ReactNode } from "react";
import { requireClinicalSession } from "@/infrastructure/auth/auth-http";
import { SessionRefresh } from "./session-refresh";
import { canRenderLocalClinicalSurface } from "@/infrastructure/runtime/local-clinical-surface";
import { notFound } from "next/navigation";

export default async function PatientsLayout({ children }: { children: ReactNode }) {
  if (!canRenderLocalClinicalSurface()) notFound();
  await requireClinicalSession();
  return <><SessionRefresh />{children}</>;
}
