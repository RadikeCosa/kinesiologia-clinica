import { beforeEach, describe, expect, it, vi } from "vitest";
import { getClinicalHome } from "../home/get-clinical-home";
import { readDailyRoute, routeCandidates, saveDailyRoute } from "./manage-daily-route";
import { DailyRouteConflictError } from "./daily-route.repository";
import { buenosAiresDate, reconcileRoute } from "@/domain/route/daily-route";
import type { ClinicalHomeData } from "@/features/clinical-home/clinical-home.types";

vi.mock("../home/get-clinical-home", () => ({ getClinicalHome: vi.fn() }));
const now = new Date("2026-10-24T20:00:00Z");
function home(): ClinicalHomeData {
  const date = "2026-10-24";
  const ids = ["late", "early", "untimed", "active", "completed", "cancelled", "yesterday", "missing-patient", "documentation"];
  return {
    referenceNow: now.toISOString(), agendaMonth: "2026-10", agendaFrom: date, agendaTo: date,
    patients: [{ id: "patient", displayName: "Persona Ficticia", treatment: { status: "active", completedSessions: 0 } }],
    agendaItems: ids.map(id => ({ id, patientId: "patient", patientName: "Persona Ficticia", treatmentId: "treatment", scheduledDate: date, scheduledTime: id === "untimed" ? undefined : id === "early" ? "08:00" : "17:00", status: id === "cancelled" ? "cancelled" : "booked", statusLabel: "Agendada" })),
    todayItems: ids.map(id => ({ id, patientId: id === "missing-patient" ? "missing" : "patient", date: id === "yesterday" ? "2026-10-23" : date, sourceState: id === "active" ? "in-progress" : id === "completed" ? "completed" : id === "cancelled" ? "cancelled" : id === "documentation" ? "care-ended" : "scheduled" })),
    dayItems: [], dailyRoute: { date, appointmentIds: ["untimed", "removed", "late"], version: "2" },
  };
}
const saved = vi.fn(async (route) => ({ ...route, version: "3" }));
const dependencies = { dailyRoutes: { get: vi.fn(), save: saved } } as unknown as Parameters<typeof saveDailyRoute>[2];
beforeEach(() => { vi.clearAllMocks(); vi.mocked(getClinicalHome).mockResolvedValue(home()); });

describe("daily route", () => {
  it("uses Buenos Aires date at the UTC midnight boundary", () => {
    expect(buenosAiresDate(new Date("2026-10-25T01:00:00Z"))).toBe("2026-10-24");
  });
  it("keeps the saved relative order, removes stale ids and appends arrivals once", async () => {
    expect(routeCandidates(home())).toEqual(["early", "late", "untimed"]);
    expect(await readDailyRoute(now, dependencies)).toEqual({ date: "2026-10-24", version: "2", appointmentIds: ["untimed", "late", "early"] });
    expect(reconcileRoute(["b", "b", "gone"], ["a", "b", "c"])).toEqual(["b", "a", "c"]);
  });
  it("defaults to agreed times before untimed visits", async () => {
    const data = home(); data.dailyRoute = undefined; vi.mocked(getClinicalHome).mockResolvedValue(data);
    expect((await readDailyRoute(now, dependencies)).appointmentIds).toEqual(["early", "late", "untimed"]);
  });
  it("saves only a permutation of today's pending appointments", async () => {
    const proposed = { date: "2026-10-24", version: "2", appointmentIds: ["early", "untimed", "late"] };
    expect((await saveDailyRoute(proposed, now, dependencies)).version).toBe("3");
    expect(saved).toHaveBeenCalledWith(proposed);
  });
  it.each([
    { version: "1", appointmentIds: ["late", "early", "untimed"] },
    { version: "2", appointmentIds: ["late", "early"] },
    { version: "2", appointmentIds: ["late", "early", "active"] },
  ])("rejects stale versions or changed membership without writing: %j", async input => {
    await expect(saveDailyRoute({ date: "2026-10-24", ...input }, now, dependencies)).rejects.toBeInstanceOf(DailyRouteConflictError);
    expect(saved).not.toHaveBeenCalled();
  });
  it("rejects other dates, malformed ids and duplicates without writing", async () => {
    for (const input of [
      { date: "2026-10-23", appointmentIds: [] },
      { date: "2026-10-24", appointmentIds: ["late", "late"] },
      { date: "2026-10-24", appointmentIds: ["../Patient/x"] },
    ]) await expect(saveDailyRoute(input, now, dependencies)).rejects.toThrow();
    expect(saved).not.toHaveBeenCalled();
  });
  it("does not replace an unreadable saved route with a fresh default", async () => {
    vi.mocked(getClinicalHome).mockResolvedValue({ ...home(), dailyRouteUnavailable: true });
    await expect(saveDailyRoute({ date: "2026-10-24", appointmentIds: [] }, now, dependencies)).rejects.toThrow("verificar");
    expect(saved).not.toHaveBeenCalled();
  });
});
