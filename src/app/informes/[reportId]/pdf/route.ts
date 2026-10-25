import { readPeriodReport } from "@/application/periods/read-period-report";
import { currentSession } from "@/infrastructure/auth/auth-http";
import { canRenderLocalClinicalSurface } from "@/infrastructure/runtime/local-clinical-surface";
import { createClinicalDependencies } from "@/infrastructure/fhir/create-clinical-dependencies";
import { ReportIntegrityError } from "@/infrastructure/fhir/periods/fhir-report.repository";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(_request: Request, { params }: { params: Promise<{ reportId: string }> }) {
  if (!canRenderLocalClinicalSurface()) return new Response(null, { status: 404 });
  if (!await currentSession()) return new Response(null, { status: 401, headers: { "Cache-Control": "no-store" } });
  const { reportId } = await params;
  if (!/^[A-Za-z0-9.-]{1,64}$/.test(reportId)) return new Response(null, { status: 404 });
  try {
    const archive = await readPeriodReport(reportId, createClinicalDependencies());
    if (!archive) return new Response(null, { status: 404 });
    const { report, pdf: bytes } = archive;
    return new Response(Buffer.from(bytes), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="informe-periodo-${report.content.periodOrdinal}.pdf"`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  } catch (e) { return new Response(e instanceof ReportIntegrityError ? e.message : "No se pudo descargar el informe.", { status: e instanceof ReportIntegrityError ? 409 : 503, headers: { "Cache-Control": "no-store" } }); }
}
