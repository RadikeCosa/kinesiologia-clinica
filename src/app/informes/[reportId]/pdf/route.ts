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
    const d = createClinicalDependencies(), report = await d.reports.get(reportId);
    if (!report) return new Response(null, { status: 404 });
    const treatment = await d.treatments.getById(report.treatmentId), period = await d.periods.get(report.periodId), patient = await d.patients.getById(report.patientId);
    if (!patient || !treatment || !period || treatment.patientId !== patient.id || period.patientId !== patient.id || period.treatmentId !== treatment.id) return new Response(null, { status: 404 });
    const bytes = await d.reports.pdf(reportId);
    return new Response(Buffer.from(bytes), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="informe-periodo-${report.content.periodOrdinal}.pdf"`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  } catch (e) { return new Response(e instanceof ReportIntegrityError ? e.message : "No se pudo descargar el informe.", { status: e instanceof ReportIntegrityError ? 409 : 503, headers: { "Cache-Control": "no-store" } }); }
}
