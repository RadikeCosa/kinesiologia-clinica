import { describe, expect, it, vi } from "vitest";
import { closeScheduledVisit, createScheduledVisit, rescheduleVisit, ScheduleOverlapError } from "./manage-scheduled-visits";
import type { ScheduledVisit } from "@/domain/schedule/scheduled-visit";

const now = new Date("2026-09-15T12:00:00.000Z");
const patient = { id: "patient-fixture", givenName: "Rosa", familyName: "Ficticia" };
const treatment = { id: "treatment-fixture", patientId: patient.id, status: "active" as const, startDate: "2026-09-01" };

function setup(initial: ScheduledVisit[] = []) {
  const records = new Map(initial.map((item) => [item.id, item]));
  return {
    records,
    dependencies: {
      clock: { now: () => now },
      patients: { getById: vi.fn(async () => patient), listByIds: vi.fn(async () => [patient]) },
      treatments: { getById: vi.fn(async () => treatment), listActive: vi.fn(async () => [treatment]), listDirectory: vi.fn(async () => [treatment]) },
      scheduledVisits: {
        getById: vi.fn(async (id: string) => records.get(id) ?? null),
        listByPatientId: vi.fn(async () => [...records.values()]),
        listOpen: vi.fn(async () => [...records.values()].filter((item) => item.status === "booked" || item.status === "proposed")),
        listBetween: vi.fn(async () => [...records.values()]),
        listChangedBetween: vi.fn(async () => [...records.values()]),
        putIfAbsent: vi.fn(async (item: ScheduledVisit) => { const saved = records.get(item.id) ?? { ...item, version: "1" }; records.set(item.id, saved); return saved; }),
        replace: vi.fn(async (original: ScheduledVisit, replacement: ScheduledVisit) => {
          const savedOriginal = { ...original, version: "2" }; const savedReplacement = { ...replacement, version: "1" };
          records.set(original.id, savedOriginal); records.set(replacement.id, savedReplacement);
          return { original: savedOriginal, replacement: savedReplacement };
        }),
        close: vi.fn(async (item: ScheduledVisit) => { const saved = { ...item, version: "2" }; records.set(item.id, saved); return saved; }),
      },
    },
  };
}

const createInput = {
  clientAppointmentId: "b73e87c5-76e4-4c75-82e2-507b91d1288a",
  patientId: patient.id,
  treatmentId: treatment.id,
  date: "2026-09-16",
  time: "10:00",
  durationMinutes: 60,
  acknowledgeConflict: false,
};

describe("scheduled visit use cases", () => {
  it("creates one stable appointment across retries", async () => {
    const { dependencies } = setup();
    const first = await createScheduledVisit(createInput, dependencies);
    const retry = await createScheduledVisit(createInput, dependencies);
    expect(retry.id).toBe(first.id);
    expect(dependencies.scheduledVisits.putIfAbsent).toHaveBeenCalledTimes(2);
  });

  it("warns about overlaps until they are acknowledged", async () => {
    const existing: ScheduledVisit = {
      id: "appointment-existing", patientId: patient.id, treatmentId: treatment.id, status: "booked",
      scheduledDate: "2026-09-16", startsAt: "2026-09-16T13:30:00.000Z", endsAt: "2026-09-16T14:30:00.000Z", durationMinutes: 60, createdAt: now.toISOString(), version: "1",
    };
    const { dependencies } = setup([existing]);
    await expect(createScheduledVisit(createInput, dependencies)).rejects.toBeInstanceOf(ScheduleOverlapError);
    await expect(createScheduledVisit({ ...createInput, acknowledgeConflict: true }, dependencies)).resolves.toBeTruthy();
  });

  it("reprograms with history and makes the retry harmless", async () => {
    const original: ScheduledVisit = {
      id: "appointment-existing", patientId: patient.id, treatmentId: treatment.id, status: "booked",
      scheduledDate: "2026-09-16", startsAt: "2026-09-16T13:00:00.000Z", endsAt: "2026-09-16T14:00:00.000Z", durationMinutes: 60, createdAt: now.toISOString(), version: "1",
    };
    const { dependencies } = setup([original]);
    const input = { ...createInput, appointmentId: original.id, expectedVersion: "1", date: "2026-09-17", reason: "patient-or-family" as const };
    const first = await rescheduleVisit(input, dependencies);
    const retry = await rescheduleVisit(input, dependencies);
    expect(first.original.status).toBe("cancelled");
    expect(first.replacement.replacesId).toBe(original.id);
    expect(retry.replacement.id).toBe(first.replacement.id);
    expect(dependencies.scheduledVisits.replace).toHaveBeenCalledTimes(1);
  });

  it("only allows no-show after the expected time and makes close idempotent", async () => {
    const future: ScheduledVisit = {
      id: "appointment-existing", patientId: patient.id, treatmentId: treatment.id, status: "booked",
      scheduledDate: "2026-09-16", startsAt: "2026-09-16T13:00:00.000Z", endsAt: "2026-09-16T14:00:00.000Z", durationMinutes: 60, createdAt: now.toISOString(), version: "1",
    };
    const { dependencies } = setup([future]);
    const input = { appointmentId: future.id, expectedVersion: "1", reason: "patient-or-family" as const };
    await expect(closeScheduledVisit(input, "no-show", dependencies)).rejects.toThrow("Todavía no corresponde");
    const cancelled = await closeScheduledVisit(input, "cancelled", dependencies);
    const retry = await closeScheduledVisit(input, "cancelled", dependencies);
    expect(retry.id).toBe(cancelled.id);
    expect(dependencies.scheduledVisits.close).toHaveBeenCalledTimes(1);
  });
});
