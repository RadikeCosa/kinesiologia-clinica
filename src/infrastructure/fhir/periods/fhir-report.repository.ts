import type { ReportRepository } from "@/application/periods/report.repository";
import type { PeriodReport } from "@/domain/treatment-period/period-report";
import { canonical, hash } from "@/infrastructure/reports/report-tools";
import type { FhirClient } from "../core/fhir.client";
import type { FhirResource } from "../core/fhir.types";
import { FhirClientError } from "../core/fhir.errors";
import { readAllResourcesByType } from "../core/fhir.bundle";
import { periodEntry } from "./period.mapper";
import { treatmentEntry } from "./fhir-period.repository";
const SYSTEM = "https://kinesiologiaadomicilio.local/fhir/identifier/period-report-operation-v1";
const BASE = "https://kinesiologiaadomicilio.local/fhir/StructureDefinition/period-report-v1";
interface Document extends FhirResource { resourceType: "DocumentReference"; status: "current" | "superseded"; subject: { reference: string }; identifier: { system: string; value: string }[]; date: string; extension: { url: string; valueString: string }[]; content: { attachment: { contentType: string; url: string } }[]; relatesTo?: { code: "replaces"; target: { reference: string } }[]; author?: { display: string }[] }
interface Binary extends FhirResource { resourceType: "Binary"; contentType: string; data: string; securityContext: { reference: string } }
export class ReportIntegrityError extends Error { constructor() { super("No se pudo verificar la integridad del informe. La lectura y descarga quedaron bloqueadas."); } }
export function createFhirReportRepository(client: FhirClient): ReportRepository {
  async function document(id: string) {
    if (!/^[A-Za-z0-9.-]{1,64}$/.test(id)) return null;
    try { const doc = await client.get<Document>(`DocumentReference/${id}`); return doc.identifier?.some(i => i.system === SYSTEM) ? doc : null; }
    catch(e) { if(e instanceof FhirClientError && (e.status === 404 || e.status === 410)) return null; throw e; }
  }
  async function file(doc: Document, type: string) {
    const url = doc.content.find(c => c.attachment.contentType === type)?.attachment.url;
    if (!url || !/^Binary\/[A-Za-z0-9.-]{1,64}$/.test(url)) throw new ReportIntegrityError();
    const binary = await client.get<Binary>(url);
    if (binary.contentType !== type || binary.securityContext?.reference !== `DocumentReference/${doc.id}` || typeof binary.data !== "string") throw new ReportIntegrityError();
    return Buffer.from(binary.data, "base64");
  }
  async function verified(doc: Document) {
    try {
      const [json,pdf] = await Promise.all([file(doc,"application/json"), file(doc,"application/pdf")]);
      const report = JSON.parse(json.toString("utf8")) as PeriodReport;
      if (hash(json) !== doc.extension.find(e => e.url === `${BASE}-archive-hash`)?.valueString) throw new ReportIntegrityError();
      const expected = (key: string) => doc.extension.find(e => e.url === `${BASE}-${key}`)?.valueString;
      if (report.patientId && doc.subject.reference === `Patient/${report.patientId}` && report.operationId === doc.identifier.find(i => i.system === SYSTEM)?.value && report.createdAt === doc.date && report.contentHash === expected("content-hash") && report.sourceHash === expected("source-hash") && report.pdfHash === expected("pdf-hash") && hash(canonical(report.content)) === report.contentHash && hash(canonical(report.sources)) === report.sourceHash && hash(pdf) === report.pdfHash && report.sourceFingerprint === report.sourceHash && (report.replaces ? doc.relatesTo?.[0]?.target.reference === `DocumentReference/${report.replaces}` : !doc.relatesTo?.length)) {
        return { report: { ...report, id: doc.id!, replaces: report.replaces ?? undefined, replacementReason: report.replacementReason ?? undefined, status: doc.status, version: doc.meta?.versionId }, pdf };
      }
    } catch(e) { if (e instanceof FhirClientError && e.status !== 404) throw e; }
    throw new ReportIntegrityError();
  }
  async function search(path: string) { return readAllResourcesByType<Document>({ client, path, resourceType: "DocumentReference" }); }
  const repository: ReportRepository = {
    async get(id) { const doc = await document(id); return doc ? (await verified(doc)).report : null; },
    async pdf(id) { const doc = await document(id); if (!doc) throw new Error("Informe no disponible."); return (await verified(doc)).pdf; },
    async byOperation(op) { if (!/^[a-f0-9-]{36}$/.test(op)) return null; const docs = await search(`DocumentReference?${new URLSearchParams({ identifier: `${SYSTEM}|${op}`, _count: "2" })}`); if (docs.length > 1) throw new ReportIntegrityError(); return docs[0] ? (await verified(docs[0])).report : null; },
    async list(patientId) { const docs = await search(`DocumentReference?${new URLSearchParams({ patient: patientId, _count: "200" })}`); return Promise.all(docs.filter(d => d.identifier?.some(i => i.system === SYSTEM)).map(async d => (await verified(d)).report)); },
    async save(report, pdf, period, treatment, previous) {
      const patientVersion = report.sourceVersions[`Patient/${report.patientId}`];
      if (!patientVersion) throw new Error("Falta la versión fuente del paciente.");
      const patient = await client.get<FhirResource>(`Patient/${report.patientId}`);
      const fullUrl = `urn:uuid:${report.operationId}`;
      const jsonId = `rs-${report.operationId}`, pdfId = `rp-${report.operationId}`;
      const doc: Document = { resourceType: "DocumentReference", status: "current", subject: { reference: `Patient/${report.patientId}` }, identifier: [{ system: SYSTEM, value: report.operationId }], date: report.createdAt, author: [{ display: report.content.professionalName }], extension: [{ url: `${BASE}-archive-hash`, valueString: hash(canonical(report)) }, { url: `${BASE}-content-hash`, valueString: report.contentHash }, { url: `${BASE}-source-hash`, valueString: report.sourceHash }, { url: `${BASE}-pdf-hash`, valueString: report.pdfHash }], content: [{ attachment: { contentType: "application/pdf", url: `Binary/${pdfId}` } }, { attachment: { contentType: "application/json", url: `Binary/${jsonId}` } }], ...(previous ? { relatesTo: [{ code: "replaces", target: { reference: `DocumentReference/${previous.id}` } }] } : {}) };
      const binary = (id: string, type: string, bytes: Uint8Array) => ({ resource: { resourceType: "Binary", id, contentType: type, securityContext: { reference: fullUrl }, data: Buffer.from(bytes).toString("base64") }, request: { method: "PUT", url: `Binary/${id}` } });
      const old = previous ? await document(previous.id) : null;
      if (previous && (!old || old.status !== "current" || old.meta?.versionId !== previous.version)) throw new Error("El informe vigente cambió.");
      await client.transaction({ resourceType: "Bundle", type: "transaction", entry: [
        periodEntry({ ...period, currentReportId: fullUrl, clinicalRevision: period.clinicalRevision + 1 }), treatmentEntry(treatment),
        { resource: patient, request: { method: "PUT", url: `Patient/${report.patientId}`, ifMatch: `W/"${patientVersion}"` } },
        { fullUrl, resource: doc, request: { method: "POST", url: "DocumentReference", ifNoneExist: `identifier=${encodeURIComponent(`${SYSTEM}|${report.operationId}`)}` } },
        binary(jsonId,"application/json", Buffer.from(canonical(report))), binary(pdfId,"application/pdf",pdf),
        ...(old ? [{ resource: { ...old, status: "superseded" }, request: { method: "PUT", url: `DocumentReference/${old.id}`, ifMatch: `W/"${old.meta?.versionId}"` } }] : []),
      ] });
    },
  };
  return repository;
}
