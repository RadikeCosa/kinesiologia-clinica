import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import PDFDocument from "pdfkit";
import type { ReportTools } from "@/application/periods/report.repository";
import type { ReportContent } from "@/domain/treatment-period/period-report";
export function canonical(value: unknown): string {
  function normalize(v: unknown): unknown {
    if (v === undefined || v === null) return null;
    if (Array.isArray(v)) return v.map(normalize);
    if (typeof v === "object") return Object.fromEntries(Object.entries(v).sort(([a],[b]) => a < b ? -1 : a > b ? 1 : 0).map(([k,x]) => [k, normalize(x)]));
    return v;
  }
  return JSON.stringify(normalize(value));
}
export const hash = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex");
export async function generateReportPdf(content: ReportContent): Promise<Uint8Array> {
  const doc = new PDFDocument({ size: "A4", margin: 48, font: path.join(process.cwd(), "assets/fonts/DejaVuSans.ttf"), info: { Title: "Informe de evolución", Author: content.professionalName } });
  const parts: Buffer[] = [];
  const done = new Promise<Buffer>((resolve, reject) => { doc.on("data", (p: Buffer) => parts.push(p)); doc.on("end", () => resolve(Buffer.concat(parts))); doc.on("error", reject); });
  doc.fontSize(18).text("Informe de evolución").moveDown();
  doc.fontSize(11).text(`${content.patientName}\nPeríodo ${content.periodOrdinal} · ${content.completed} de ${content.quota ?? "sin cupo"} sesiones\nFrecuencia: ${content.frequency ?? "Sin registrar"}`);
  const section = (title: string, text: string) => { doc.moveDown().fontSize(12).text(title); doc.moveDown(0.3).fontSize(10).text(text || "Sin registrar", { lineGap: 3 }); };
  if (content.partialReason) section("Cierre parcial", content.partialReason);
  section("Sesiones realizadas", content.sessionDates.join(" · "));
  section("Contexto y objetivos", content.narrative.context);
  section("Evolución", content.narrative.evolution);
  section("Intervenciones", content.narrative.interventions);
  section("Mediciones", content.measurements.join("\n\n"));
  section("Próximo paso", content.narrative.nextStep);
  section("Observaciones del profesional", content.narrative.observations);
  section("Profesional", `${content.professionalName}${content.registration ? ` · Matrícula ${content.registration}` : ""}`);
  doc.end();
  return done;
}
export const reportTools: ReportTools = { canonical, hash, pdf: generateReportPdf, operationId: randomUUID };
