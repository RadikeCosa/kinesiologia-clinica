import { describe, expect, it } from "vitest";
import {
  filterDirectory,
  getTodayDisplayState,
  presentToday,
} from "@/features/clinical-home/clinical-home.presenter";
import {
  getClinicalHomeScenario,
  LAB_REFERENCE_NOW,
} from "@/features/clinical-home/clinical-home.scenarios";

describe("presentToday", () => {
  it("orders the current day by time and keeps visits without a time separate", () => {
    const today = presentToday(getClinicalHomeScenario("habitual"));

    expect(today.timed.map((item) => [item.scheduledTime, item.displayState])).toEqual([
      ["08:00", "completed"],
      ["09:30", "past-unresolved"],
      ["11:00", "upcoming"],
      ["15:00", "upcoming"],
    ]);
    expect(today.withoutTime.map((item) => item.patient.id)).toEqual(["ana"]);
    expect(today.summary).toEqual({ completed: 1, pending: 1, upcoming: 3 });
  });

  it("puts unfinished work from an earlier day first and exposes a sync error", () => {
    const today = presentToday(getClinicalHomeScenario("workflow"));

    expect(today.previousPending.map((item) => item.patient.id)).toEqual(["pedro"]);
    expect(today.timed.map((item) => item.displayState)).toEqual([
      "sync-error",
      "documentation-pending",
      "in-progress",
    ]);
    expect(today.summary).toEqual({ completed: 0, pending: 2, upcoming: 0 });
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
