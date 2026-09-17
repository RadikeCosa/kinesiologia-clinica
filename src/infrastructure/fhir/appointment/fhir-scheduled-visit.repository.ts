import type { ScheduledVisitRepository } from "@/application/schedule/scheduled-visit.repository";
import type { ScheduledVisit } from "@/domain/schedule/scheduled-visit";
import { readAllResourcesByType } from "@/infrastructure/fhir/core/fhir.bundle";
import type { FhirClient } from "@/infrastructure/fhir/core/fhir.client";
import { FhirClientError } from "@/infrastructure/fhir/core/fhir.errors";
import type { FhirBundle } from "@/infrastructure/fhir/core/fhir.types";
import { mapFhirAppointment, mapScheduledVisitToFhir, type FhirAppointment } from "./appointment.mapper";

export class ScheduledVisitConflictError extends Error {
  constructor(message = "La cita cambió o su identidad corresponde a otros datos.") { super(message); }
}

function sameIdentity(first: ScheduledVisit, second: ScheduledVisit) {
  return first.patientId === second.patientId && first.treatmentId === second.treatmentId &&
    first.scheduledDate === second.scheduledDate && first.startsAt === second.startsAt && first.endsAt === second.endsAt;
}

function mapAll(resources: FhirAppointment[]) {
  return resources.flatMap((resource) => mapFhirAppointment(resource) ?? []);
}

export function createFhirScheduledVisitRepository(client: FhirClient): ScheduledVisitRepository {
  async function getById(id: string) {
    if (!/^[A-Za-z0-9.-]{1,64}$/.test(id)) return null;
    try { return mapFhirAppointment(await client.get<FhirAppointment>(`Appointment/${id}`)); }
    catch (error) {
      if (error instanceof FhirClientError && error.status === 404) return null;
      throw error;
    }
  }

  async function read(path: string) {
    return mapAll(await readAllResourcesByType<FhirAppointment>({ client, path, resourceType: "Appointment" }));
  }

  async function transact(entries: Array<{ visit: ScheduledVisit; ifMatch?: string }>) {
    await client.transaction<FhirBundle>({
      resourceType: "Bundle",
      type: "transaction",
      entry: entries.map(({ visit, ifMatch }) => ({
        resource: mapScheduledVisitToFhir(visit),
        request: { method: "PUT", url: `Appointment/${visit.id}`, ...(ifMatch ? { ifMatch: `W/\"${ifMatch}\"` } : {}) },
      })),
    });
  }

  return {
    getById,
    listByPatientId: (patientId) => read(`Appointment?${new URLSearchParams({ patient: `Patient/${patientId}`, _count: "200" })}`),
    listOpen: () => read(`Appointment?${new URLSearchParams({ status: "proposed,booked", _count: "200" })}`),
    listBetween: (from, to) => {
      const search = new URLSearchParams({ _count: "200" });
      search.append("date", `ge${from}`);
      search.append("date", `le${to}`);
      return read(`Appointment?${search}`);
    },
    listChangedBetween: (from, to) => {
      const search = new URLSearchParams({ _count: "200" });
      search.append("_lastUpdated", `ge${from}`);
      search.append("_lastUpdated", `lt${to}`);
      return read(`Appointment?${search}`);
    },
    async putIfAbsent(visit) {
      const existing = await getById(visit.id);
      if (existing) {
        if (!sameIdentity(existing, visit)) throw new ScheduledVisitConflictError();
        return existing;
      }
      await client.put(`Appointment/${visit.id}`, mapScheduledVisitToFhir(visit));
      const confirmed = await getById(visit.id);
      if (!confirmed || !sameIdentity(confirmed, visit)) throw new ScheduledVisitConflictError();
      return confirmed;
    },
    async replace(original, replacement) {
      const currentOriginal = await getById(original.id);
      const currentReplacement = await getById(replacement.id);
      if (currentOriginal?.replacedById === replacement.id && currentReplacement?.replacesId === original.id) {
        return { original: currentOriginal, replacement: currentReplacement };
      }
      if (!original.version) throw new ScheduledVisitConflictError("Falta la versión vigente de la cita.");
      await transact([{ visit: original, ifMatch: original.version }, { visit: replacement }]);
      const [savedOriginal, savedReplacement] = await Promise.all([getById(original.id), getById(replacement.id)]);
      if (!savedOriginal || !savedReplacement) throw new Error("La reprogramación todavía no pudo confirmarse.");
      return { original: savedOriginal, replacement: savedReplacement };
    },
    async close(visit) {
      if (!visit.version) throw new ScheduledVisitConflictError("Falta la versión vigente de la cita.");
      await transact([{ visit, ifMatch: visit.version }]);
      const confirmed = await getById(visit.id);
      if (!confirmed || confirmed.status !== visit.status) throw new Error("El cambio todavía no pudo confirmarse.");
      return confirmed;
    },
  };
}
