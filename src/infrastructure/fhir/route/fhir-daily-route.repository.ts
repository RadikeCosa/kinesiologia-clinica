import { agendaCoordinatorEntry, createFhirAgendaCoordinatorRepository, refreshAgendaLease } from "../appointment/fhir-agenda-coordinator.repository";
import type { DailyRoute } from "@/domain/route/daily-route";
import { DailyRouteConflictError, type DailyRouteRepository } from "@/application/route/daily-route.repository";
import type { FhirClient } from "../core/fhir.client";
import { FhirClientError } from "../core/fhir.errors";

const SYSTEM = "urn:kinesiologia-clinica:daily-route";
interface RouteList {
  resourceType: "List";
  id: string;
  status: "current";
  mode: "working";
  identifier: Array<{ system: string; value: string }>;
  orderedBy?: { coding: Array<{ system: string; code: string }> };
  entry?: Array<{ item: { reference: string } }>;
  meta?: { versionId?: string };
}
function resourceId(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || new Date(`${date}T12:00:00Z`).toISOString().slice(0, 10) !== date) throw new Error("Fecha de recorrido inválida.");
  return `daily-route-${date}`;
}
function map(resource: RouteList, date: string): DailyRoute {
  if (resource.resourceType !== "List" || resource.id !== resourceId(date) || resource.status !== "current" || resource.mode !== "working" || !resource.identifier?.some(i => i.system === SYSTEM && i.value === date) || !resource.meta?.versionId || resource.entry?.some(e => !/^Appointment\/[A-Za-z0-9.-]{1,64}$/.test(e.item?.reference ?? ""))) throw new Error("No se pudo verificar el recorrido guardado.");
  const appointmentIds = (resource.entry ?? []).map(e => e.item.reference.slice("Appointment/".length));
  if (new Set(appointmentIds).size !== appointmentIds.length) throw new Error("El recorrido guardado contiene visitas repetidas.");
  return { date, version: resource.meta.versionId, appointmentIds };
}
export function createFhirDailyRouteRepository(client: FhirClient): DailyRouteRepository {
  async function get(date: string) {
    try { return map(await client.get<RouteList>(`List/${resourceId(date)}`), date); }
    catch (error) { if (error instanceof FhirClientError && error.status === 404) return null; throw error; }
  }
  return {
    get,
    async save(route) {
      return createFhirAgendaCoordinatorRepository(client).withLock(async lease => {
        const current = await get(route.date);
        if (current?.version !== route.version) throw new DailyRouteConflictError();
        const id = resourceId(route.date);
        const resource: RouteList = { resourceType: "List", id, status: "current", mode: "working", identifier: [{ system: SYSTEM, value: route.date }], orderedBy: { coding: [{ system: "http://terminology.hl7.org/CodeSystem/list-order", code: "user" }] }, entry: route.appointmentIds.map(id => ({ item: { reference: `Appointment/${id}` } })) };
        try {
          await client.transaction({ resourceType: "Bundle", type: "transaction", entry: [await agendaCoordinatorEntry(client, lease), { resource, request: { method: "PUT", url: `List/${id}`, ...(route.version ? { ifMatch: `W/"${route.version}"` } : {}) } }] });
        } catch (error) {
          if (error instanceof FhirClientError && [409, 412].includes(error.status ?? 0)) throw new DailyRouteConflictError();
          throw error;
        }
        await refreshAgendaLease(client, lease);
        const confirmed = await get(route.date);
        if (!confirmed) throw new Error("No se pudo confirmar el recorrido guardado.");
        return confirmed;
      });
    },
  };
}
