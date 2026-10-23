import { randomUUID } from "node:crypto";
import type { AgendaCoordinatorRepository, AgendaLease } from "@/application/schedule/agenda-coordinator.repository";
import type { FhirClient } from "@/infrastructure/fhir/core/fhir.client";
import { FhirClientError } from "@/infrastructure/fhir/core/fhir.errors";

export const AGENDA_COORDINATOR_ID = "clinical-agenda-coordinator-v1";
const OWNER_URL = "https://kinesiologiaadomicilio.local/fhir/StructureDefinition/agenda-lock-owner-v1";
const EXPIRES_URL = "https://kinesiologiaadomicilio.local/fhir/StructureDefinition/agenda-lock-expires-v1";
const LOCK_LIFETIME_MS = 120_000;
const ACQUIRE_ATTEMPTS = 40;
const RETRY_DELAY_MS = 250;

type FhirSchedule = {
  resourceType: "Schedule";
  id?: string;
  active?: boolean;
  actor?: Array<{ reference?: string }>;
  extension?: Array<{ url?: string; valueString?: string; valueInstant?: string }>;
  meta?: { versionId?: string };
};

type TransactionEntry = { resource: FhirSchedule; request: { method: "PUT"; url: string; ifMatch: string } };

export class AgendaLockConflictError extends Error {
  constructor(message = "La agenda está cambiando en otro dispositivo. Esperá un momento y volvé a intentar.") { super(message); }
}

async function readSchedule(client: FhirClient): Promise<FhirSchedule> {
  try { return await client.get<FhirSchedule>(`Schedule/${AGENDA_COORDINATOR_ID}`); }
  catch (error) {
    if (error instanceof FhirClientError && error.status === 404) {
      throw new Error("Falta provisionar el coordinador versionado de agenda en el servidor FHIR.");
    }
    throw error;
  }
}

function lockFields(schedule: FhirSchedule) {
  return {
    owner: schedule.extension?.find((item) => item.url === OWNER_URL)?.valueString,
    expiresAt: schedule.extension?.find((item) => item.url === EXPIRES_URL)?.valueInstant,
  };
}

function setLock(schedule: FhirSchedule, owner?: string, expiresAt?: string): FhirSchedule {
  const extension = (schedule.extension ?? []).filter((item) => item.url !== OWNER_URL && item.url !== EXPIRES_URL);
  if (owner && expiresAt) extension.push({ url: OWNER_URL, valueString: owner }, { url: EXPIRES_URL, valueInstant: expiresAt });
  return { ...schedule, extension: extension.length ? extension : undefined };
}

function isVersionConflict(error: unknown) {
  return error instanceof FhirClientError && (error.status === 409 || error.status === 412);
}

async function updateWithVersion(client: FhirClient, schedule: FhirSchedule) {
  const version = schedule.meta?.versionId;
  if (!schedule.id || !version) throw new AgendaLockConflictError("El coordinador de agenda no tiene una versión verificable.");
  await client.transaction({
    resourceType: "Bundle", type: "transaction",
    entry: [{ resource: schedule, request: { method: "PUT", url: `Schedule/${schedule.id}`, ifMatch: `W/\"${version}\"` } }],
  });
}

export async function agendaCoordinatorEntry(client: FhirClient, lease: AgendaLease): Promise<TransactionEntry> {
  const current = await readSchedule(client);
  const fields = lockFields(current);
  if (current.meta?.versionId !== lease.version || fields.owner !== lease.owner || !fields.expiresAt || new Date(fields.expiresAt).getTime() <= Date.now()) {
    throw new AgendaLockConflictError("La reserva del horario venció o cambió. Recargá antes de guardar.");
  }
  const expiresAt = new Date(Date.now() + LOCK_LIFETIME_MS).toISOString();
  lease.expiresAt = expiresAt;
  return {
    resource: setLock(current, lease.owner, expiresAt),
    request: { method: "PUT", url: `Schedule/${AGENDA_COORDINATOR_ID}`, ifMatch: `W/\"${lease.version}\"` },
  };
}

export async function refreshAgendaLease(client: FhirClient, lease: AgendaLease) {
  const current = await readSchedule(client);
  const fields = lockFields(current);
  if (fields.owner !== lease.owner || !current.meta?.versionId) throw new AgendaLockConflictError();
  lease.version = current.meta.versionId;
  lease.expiresAt = fields.expiresAt ?? lease.expiresAt;
}

export function createFhirAgendaCoordinatorRepository(client: FhirClient): AgendaCoordinatorRepository {
  async function acquire(): Promise<AgendaLease> {
    const owner = randomUUID();
    for (let attempt = 0; attempt < ACQUIRE_ATTEMPTS; attempt += 1) {
      const current = await readSchedule(client);
      const version = current.meta?.versionId;
      if (!version) throw new AgendaLockConflictError("El coordinador de agenda no tiene una versión verificable.");
      const fields = lockFields(current);
      const expiry = fields.expiresAt ? new Date(fields.expiresAt).getTime() : 0;
      if (fields.owner && expiry > Date.now()) {
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
        continue;
      }
      const expiresAt = new Date(Date.now() + LOCK_LIFETIME_MS).toISOString();
      try { await updateWithVersion(client, setLock(current, owner, expiresAt)); }
      catch (error) {
        if (isVersionConflict(error)) continue;
        throw error;
      }
      const acquired = await readSchedule(client);
      if (lockFields(acquired).owner === owner && acquired.meta?.versionId) return { owner, version: acquired.meta.versionId, expiresAt };
    }
    throw new AgendaLockConflictError("La agenda sigue ocupada por otra operación. Esperá un momento y volvé a intentar.");
  }

  async function release(lease: AgendaLease) {
    const current = await readSchedule(client);
    if (lockFields(current).owner !== lease.owner) return;
    try { await updateWithVersion(client, setLock(current)); }
    catch (error) { if (!isVersionConflict(error)) throw error; }
  }

  return {
    async withLock<T>(operation: (lease: AgendaLease) => Promise<T>): Promise<T> {
      const lease = await acquire();
      let operationFailed = false;
      try { return await operation(lease); }
      catch (error) { operationFailed = true; throw error; }
      finally {
        try { await release(lease); }
        catch (error) { if (!operationFailed) throw error; }
      }
    },
  };
}
