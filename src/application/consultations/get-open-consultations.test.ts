import { expect, it, vi } from "vitest";
import type { Consultation } from "@/domain/consultation/consultation";
import type { EvaluationAppointment } from "@/domain/consultation/consultation-appointment";
import { getOpenConsultations } from "./get-open-consultations";

it("uses only open evaluation appointments when presenting the next step and reads each patient once", async () => {
  const base: Consultation = { id: "consultation-a", patientId: "fictional", status: "coordinating", contacts: [], noticesAndConsents: [], quotes: [], followUps: [], appointmentIds: ["cancelled", "proposed"], createdAt: "2026-10-23T10:00:00Z" };
  const getById = vi.fn(async () => ({ id: "fictional", givenName: "Persona", familyName: "Inventada" }));
  const appointments: Record<string, EvaluationAppointment> = {
    cancelled: { id: "cancelled", patientId: "fictional", consultationId: base.id, status: "cancelled", scheduledDate: "2026-10-24", createdAt: base.createdAt },
    proposed: { id: "proposed", patientId: "fictional", consultationId: base.id, status: "proposed", scheduledDate: "2026-10-25", createdAt: base.createdAt },
  };
  const result = await getOpenConsultations(new Date("2026-10-23T12:00:00Z"), {
    patients: { getById },
    consultations: { listActive: async () => [base, { ...base, id: "consultation-b", appointmentIds: [] }], getEvaluationAppointment: async id => appointments[id] ?? null },
  });
  expect(getById).toHaveBeenCalledTimes(1);
  expect(result.find(item => item.id === base.id)).toMatchObject({ patientName: "Persona Inventada", statusLabel: "En coordinación", nextEvaluation: { date: "2026-10-25" } });
  expect(result.find(item => item.id === "consultation-b")?.nextEvaluation).toBeUndefined();
});
