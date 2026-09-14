import { describe, expect, it, vi } from "vitest";
import { createVisit, VisitConflictError } from "./create-visit";
import type { Visit } from "@/domain/visit/visit";

const input = {
  clientVisitId: "cd1ee5a0-2f2e-4fca-876b-23dba8261e7e",
  patientId: "fixture-patient",
  treatmentId: "fixture-treatment",
  captureMode: "retrospective" as const,
  startedAt: "2026-09-14T14:00:00.000Z",
  endedAt: "2026-09-14T14:45:00.000Z",
  clinicalNote: {
    subjective: "Estado ficticio",
    intervention: "Intervención ficticia",
    assessment: "Respuesta ficticia",
  },
  metrics: [],
};

function dependencies(existing: Visit | null = null) {
  let saved = existing;
  const put = vi.fn(async (visit: Visit) => { saved = visit; });
  return {
    patients: { getById: vi.fn(async () => ({ id: input.patientId, givenName: "Persona", familyName: "Ficticia" })), listByIds: vi.fn(async () => []) },
    treatments: { getById: vi.fn(async () => ({ id: input.treatmentId, patientId: input.patientId, status: "active" as const, startDate: "2026-09-14" })), listActive: vi.fn(async () => []) },
    visits: { getById: vi.fn(async () => saved), listByPatientId: vi.fn(async () => []), put },
    metrics: { listByVisitId: vi.fn(async () => []), putIfAbsent: vi.fn(async () => {}) },
  };
}

describe("createVisit", () => {
  it("keeps a stable visit identity across retries and rejects changed content", async () => {
    const ports = dependencies();
    const first = await createVisit(input, ports);
    const retry = await createVisit(input, ports);
    expect(first.visit.id).toBe(`visit-${input.clientVisitId}`);
    expect(retry.visit.id).toBe(first.visit.id);
    expect(ports.visits.put).toHaveBeenCalledTimes(1);
    await expect(createVisit({ ...input, clinicalNote: { ...input.clinicalNote, assessment: "Otra respuesta ficticia" } }, ports)).rejects.toBeInstanceOf(VisitConflictError);
  });

  it("does not write when the treatment belongs to another patient", async () => {
    const ports = dependencies();
    ports.treatments.getById.mockResolvedValue({ id: input.treatmentId, patientId: "other-patient", status: "active", startDate: "2026-09-14" });
    await expect(createVisit(input, ports)).rejects.toThrow("tratamiento no está disponible");
    expect(ports.visits.put).not.toHaveBeenCalled();
  });
});
