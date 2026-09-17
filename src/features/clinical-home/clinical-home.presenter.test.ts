import { describe, expect, it } from "vitest";
import {
  filterDirectory,
  formatFriendlyDateTime,
  getTodayDisplayState,
  presentDay,
  presentToday,
  presentWeek,
} from "@/features/clinical-home/clinical-home.presenter";
import {
  getClinicalHomeScenario,
  LAB_REFERENCE_NOW,
} from "@/features/clinical-home/clinical-home.scenarios";

describe("presentToday", () => {
  it("orders the current day by time and keeps visits without a time separate", () => {
    const today = presentToday(getClinicalHomeScenario("habitual"));

    expect(today.timed.map((item) => [item.scheduledTime, item.displayState])).toEqual([
      ["09:30", "past-unresolved"],
      ["11:00", "upcoming"],
      ["15:00", "upcoming"],
    ]);
    expect(today.completed.map((item) => item.scheduledTime)).toEqual(["08:00"]);
    expect(today.withoutTime.map((item) => item.patient.id)).toEqual(["ana"]);
    expect(today.summary).toEqual({ completed: 1, pending: 1, upcoming: 3 });
  });

  it("puts unfinished work from an earlier day first and exposes a sync error", () => {
    const today = presentToday(getClinicalHomeScenario("workflow"));

    expect(today.previousPending.map((item) => item.patient.id)).toEqual(["pedro"]);
    expect(today.timed.map((item) => item.displayState)).toEqual([
      "sync-error",
      "documentation-pending",
    ]);
    expect(today.activeVisit?.displayState).toBe("in-progress");
    expect(today.summary).toEqual({ completed: 0, pending: 3, upcoming: 0 });
  });

  it("derives scheduled states from the fixed reference time", () => {
    expect(
      getTodayDisplayState(
        { id: "before", patientId: "patient", date: "2026-09-15", scheduledTime: "10:29", sourceState: "scheduled" },
        LAB_REFERENCE_NOW,
      ),
    ).toBe("past-unresolved");
    expect(
      getTodayDisplayState(
        { id: "after", patientId: "patient", date: "2026-09-15", scheduledTime: "10:31", sourceState: "scheduled" },
        LAB_REFERENCE_NOW,
      ),
    ).toBe("upcoming");
  });
});

describe("weekly operational view", () => {
  it("builds seven consecutive days and excludes cancellations from the count", () => {
    const scenario = getClinicalHomeScenario("habitual");
    const week = presentWeek(scenario.referenceNow, [
      ...scenario.todayItems,
      { id: "tomorrow", patientId: "rosa", date: "2026-09-16", scheduledTime: "10:00", sourceState: "scheduled" },
      { id: "cancelled", patientId: "rosa", date: "2026-09-16", scheduledTime: "11:00", sourceState: "cancelled" },
    ]);

    expect(week).toHaveLength(7);
    expect(week[0]).toMatchObject({ date: "2026-09-15", weekdayLabel: "Hoy", visitCount: 5 });
    expect(week[1]).toMatchObject({ date: "2026-09-16", visitCount: 1 });
    expect(week[6].date).toBe("2026-09-21");
  });

  it("keeps overdue work in Today instead of carrying it into a future day", () => {
    const scenario = getClinicalHomeScenario("workflow");
    const day = presentDay({
      referenceNow: scenario.referenceNow,
      selectedDate: "2026-09-17",
      patients: scenario.patients,
      dayItems: scenario.todayItems,
    });

    expect(day.isToday).toBe(false);
    expect(day.activeVisit?.patient.id).toBe("rosa");
    expect(day.previousPending).toEqual([]);
  });

  it("counts unresolved earlier visits in the Today badge", () => {
    const week = presentWeek(LAB_REFERENCE_NOW, [
      { id: "today", patientId: "rosa", date: "2026-09-15", sourceState: "scheduled" },
      { id: "overdue", patientId: "rosa", date: "2026-09-14", scheduledTime: "09:00", sourceState: "scheduled" },
      { id: "closed", patientId: "rosa", date: "2026-09-14", scheduledTime: "10:00", sourceState: "cancelled" },
    ]);
    expect(week[0].visitCount).toBe(2);
  });

  it("shows a past appointment under the day when it was closed", () => {
    const scenario = getClinicalHomeScenario("workflow");
    const closed = {
      id: "closed-past",
      patientId: scenario.patients[0].id,
      date: "2026-09-14",
      changeDate: "2026-09-15",
      scheduledTime: "09:00",
      sourceState: "cancelled" as const,
    };
    const today = presentDay({ referenceNow: scenario.referenceNow, selectedDate: "2026-09-15", patients: scenario.patients, dayItems: [...scenario.todayItems, closed] });
    const tomorrow = presentDay({ referenceNow: scenario.referenceNow, selectedDate: "2026-09-16", patients: scenario.patients, dayItems: [...scenario.todayItems, closed] });

    expect(today.changes.map((item) => item.id)).toContain("closed-past");
    expect(today.previousPending.map((item) => item.id)).not.toContain("closed-past");
    expect(tomorrow.changes.map((item) => item.id)).not.toContain("closed-past");
  });
});

describe("filterDirectory", () => {
  const patients = getClinicalHomeScenario("habitual").patients;

  it("searches names without requiring accents and also searches contact data", () => {
    expect(filterDirectory(patients, "martin", "all").map((patient) => patient.id)).toEqual(["martin"]);
    expect(filterDirectory(patients, "000 0103", "all").map((patient) => patient.id)).toEqual(["rosa"]);
    expect(filterDirectory(patients, "pasaje de ensayo", "all").map((patient) => patient.id)).toEqual(["carlos"]);
  });

  it("filters by treatment state", () => {
    expect(filterDirectory(patients, "", "paused").map((patient) => patient.id)).toEqual(["julieta"]);
    expect(filterDirectory(patients, "", "finished").map((patient) => patient.id)).toEqual(["mario"]);
  });
});

describe("friendly appointment dates", () => {
  it("shows a local readable date and marks the time as hours", () => {
    expect(formatFriendlyDateTime("2026-09-17", "18:00")).toMatch(/Jue.*17.*sept.*18:00 hs/i);
    expect(formatFriendlyDateTime("2026-09-17")).toMatch(/sin horario$/);
  });
});
