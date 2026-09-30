import { createHash } from "node:crypto";
import type { PeriodRepository } from "@/application/periods/period.repository";
import type { Treatment } from "@/domain/treatment/treatment";
import { PeriodStateError } from "@/domain/treatment-period/treatment-period";
import type { TreatmentPeriod } from "@/domain/treatment-period/treatment-period";
import type { FhirResource } from "../core/fhir.types";
import type { FhirClient } from "../core/fhir.client";
import { FhirClientError } from "../core/fhir.errors";
import { readAllResourcesByType } from "../core/fhir.bundle";
import { treatmentResource } from "../administration/fhir-clinical-administration.repository";
import { createFhirTreatmentRepository } from "../episode-of-care/fhir-treatment.repository";
import { mapFhirPeriod, mapPeriodToFhir, periodEntry, PERIOD_CATEGORY, type PeriodResource } from "./period.mapper";
export function firstPeriodId(treatmentId: string) { return `tp-${createHash("sha256").update(`treatment-period-v1:${treatmentId}:1`).digest("hex").slice(0, 40)}`; }
export function treatmentEntry(treatment: Treatment) {
  if (!treatment.version) throw new Error("Falta versión del tratamiento.");
  return { resource: treatmentResource(treatment), request: { method: "PUT" as const, url: `EpisodeOfCare/${treatment.id}`, ifMatch: `W/"${treatment.version}"` } };
}
export function createFhirPeriodRepository(client: FhirClient): PeriodRepository {
  const treatments = createFhirTreatmentRepository(client);
  const first = (t: Treatment): TreatmentPeriod => ({ id: firstPeriodId(t.id), treatmentId: t.id, patientId: t.patientId, ordinal: 1, quota: t.plannedSessionCount, frequency: t.plannedFrequency, phase: t.status === "finished" ? "closed" : "open", available: t.status === "active", clinicalRevision: 0 });
  const repository: PeriodRepository = {
    firstId: firstPeriodId,
    async get(id) {
      if (!/^[A-Za-z0-9.-]{1,64}$/.test(id)) return null;
      try { return mapFhirPeriod(await client.get<PeriodResource>(`CarePlan/${id}`)); }
      catch (error) { if (error instanceof FhirClientError && (error.status === 404 || error.status === 410)) return null; throw error; }
    },
    async current(t) {
      if (t.currentPeriodId) { const p = await repository.get(t.currentPeriodId); if (!p || p.treatmentId !== t.id || p.patientId !== t.patientId) throw new PeriodStateError("No se pudo verificar el período vigente."); return p; }
      return (await repository.get(firstPeriodId(t.id))) ?? first(t);
    },
    async list(t) {
      const path = `CarePlan?${new URLSearchParams({ patient: t.patientId, category: `${PERIOD_CATEGORY}|treatment-period`, _count: "200" })}`;
      const found = (await readAllResourcesByType<PeriodResource>({ client, path, resourceType: "CarePlan" })).filter(r => r.supportingInfo?.some(v => v.reference === `EpisodeOfCare/${t.id}`)).map(mapFhirPeriod);
      return found.length ? found.sort((a,b) => a.ordinal-b.ordinal) : [first(t)];
    },
    async materialize(t) {
      if (t.currentPeriodId) return repository.current(t);
      const already = await repository.get(firstPeriodId(t.id));
      if (already) {
        await client.transaction({ resourceType: "Bundle", type: "transaction", entry: [treatmentEntry({ ...t, currentPeriodId: already.id })] });
        return already;
      }
      const p = first(t);
      try { await client.transaction({ resourceType: "Bundle", type: "transaction", entry: [treatmentEntry({ ...t, currentPeriodId: p.id }), { resource: mapPeriodToFhir(p), request: { method: "PUT", url: `CarePlan/${p.id}` } }] }); }
      catch (error) {
        if (!(error instanceof FhirClientError && (error.status === 409 || error.status === 412))) throw error;
        const latest = await treatments.getById(t.id);
        if (!latest?.currentPeriodId) throw error;
        return repository.current(latest);
      }
      const saved = await repository.get(p.id); if (!saved) throw new Error("No se pudo verificar el período."); return saved;
    },
    async transition(period, treatment, nextPeriod, expectedPatientVersion) {
      const patient = expectedPatientVersion ? await client.get<FhirResource>(`Patient/${treatment.patientId}`) : null;
      await client.transaction({ resourceType: "Bundle", type: "transaction", entry: [periodEntry(period), treatmentEntry(treatment), ...(patient ? [{ resource: patient, request: { method: "PUT", url: `Patient/${treatment.patientId}`, ifMatch: `W/"${expectedPatientVersion}"` } }] : []), ...(nextPeriod ? [{ resource: mapPeriodToFhir(nextPeriod), request: { method: "PUT", url: `CarePlan/${nextPeriod.id}` } }] : [])] });
    },
  };
  return repository;
}
