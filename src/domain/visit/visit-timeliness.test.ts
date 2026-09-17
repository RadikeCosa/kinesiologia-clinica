import { describe, expect, it } from "vitest";
import { deriveDocumentationTimeliness, deriveStartPunctuality } from "./visit-timeliness";
import type { ScheduledVisit } from "@/domain/schedule/scheduled-visit";
import type { Visit } from "./visit";

const appointment: ScheduledVisit = { id: "appointment-1", patientId: "patient-1", treatmentId: "treatment-1", status: "fulfilled", scheduledDate: "2026-09-15", startsAt: "2026-09-15T10:00:00-03:00", endsAt: "2026-09-15T11:00:00-03:00", durationMinutes: 60, createdAt: "2026-09-10T10:00:00Z" };
const visit: Visit = { id: "visit-1", patientId: "patient-1", treatmentId: "treatment-1", status: "finished", startedAt: "2026-09-15T10:15:00-03:00", endedAt: "2026-09-15T11:00:00-03:00", recordedAt: "2026-09-15T14:30:00Z" };

describe("visit timeliness", () => {
  it("uses the agreed thresholds for start punctuality", () => {
    expect(deriveStartPunctuality(visit, appointment)).toBe("on-time");
    expect(deriveStartPunctuality({ ...visit, startedAt: "2026-09-15T10:16:00-03:00" }, appointment)).toBe("delayed");
    expect(deriveStartPunctuality({ ...visit, startedAt: "2026-09-15T11:01:00-03:00" }, appointment)).toBe("severely-delayed");
  });

  it("classifies documentation by elapsed hour and local day", () => {
    expect(deriveDocumentationTimeliness(visit)).toBe("at-the-time");
    expect(deriveDocumentationTimeliness({ ...visit, recordedAt: "2026-09-15T18:00:00Z" })).toBe("same-day");
    expect(deriveDocumentationTimeliness({ ...visit, recordedAt: "2026-09-16T04:00:00Z" })).toBe("later");
  });

  it("falls back to the historical indicator without an appointment", () => {
    expect(deriveStartPunctuality({ ...visit, legacyStartPunctuality: "delayed" }, null)).toBe("delayed");
  });
});
