import { describe, expect, it } from "vitest";
import type { OpenConsultationViewModel } from "./clinical-home.types";
import { consultationAttention, consultationsToAttend } from "./consultations.presenter";

const now = "2026-10-23T12:00:00Z";
const consultation = (id: string, overrides: Partial<OpenConsultationViewModel> = {}): OpenConsultationViewModel => ({ id, patientName: `Persona ficticia ${id}`, statusLabel: "Abierta", followUps: [], ...overrides });

describe("consultas por atender", () => {
  it("includes contacts later today in Buenos Aires and excludes tomorrow", () => {
    expect(consultationAttention(consultation("today", { followUps: [{ id: "f", dueAt: "2026-10-24T02:30:00Z", overdue: false }] }), now)?.label).toContain("Contacto para hoy");
    expect(consultationAttention(consultation("tomorrow", { followUps: [{ id: "f", dueAt: "2026-10-24T03:30:00Z", overdue: false }] }), now)).toBeNull();
  });

  it("keeps scheduled evaluations out of the group without a next step", () => {
    expect(consultationAttention(consultation("evaluation", { nextEvaluation: { date: "2026-10-24" } }), now)).toBeNull();
    expect(consultationAttention(consultation("nothing"), now)?.group).toBe("no-next-step");
  });

  it("lists each consultation once and puts the oldest contact before consultations without a next step", () => {
    const followUp = (id: string, dueAt: string) => ({ id, dueAt, overdue: true });
    const tasks = consultationsToAttend([
      consultation("none"),
      consultation("recent", { followUps: [followUp("a", "2026-10-22T12:00:00Z"), followUp("b", "2026-10-23T11:00:00Z")] }),
      consultation("old", { followUps: [followUp("c", "2026-10-20T12:00:00Z")] }),
    ], now);
    expect(tasks.map(task => task.consultation.id)).toEqual(["old", "recent", "none"]);
    expect(tasks[0].attention.label).toContain("Contacto atrasado");
  });
});
