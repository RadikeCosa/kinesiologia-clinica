import { describe, expect, it } from "vitest";
import { appointmentsOverlap, createScheduledVisitFromInput, createScheduledVisitSchema } from "./scheduled-visit";

const base = { clientAppointmentId: "11111111-1111-4111-8111-111111111111", patientId: "patient-1", treatmentId: "treatment-1", durationMinutes: 60, acknowledgeConflict: false };

describe("scheduled visit", () => {
  it("creates a proposed visit when only a date is known", () => {
    const input = createScheduledVisitSchema.parse({ ...base, date: "2026-09-20" });
    expect(createScheduledVisitFromInput(input, "2026-09-15T12:00:00Z")).toMatchObject({ status: "proposed", scheduledDate: "2026-09-20", startsAt: undefined });
  });

  it("creates a booked 60 minute visit with Buenos Aires offset", () => {
    const input = createScheduledVisitSchema.parse({ ...base, date: "2026-09-20", time: "10:30" });
    expect(createScheduledVisitFromInput(input, "2026-09-15T12:00:00Z")).toMatchObject({ status: "booked", startsAt: "2026-09-20T10:30:00-03:00", endsAt: "2026-09-20T14:30:00.000Z" });
  });

  it("detects real overlap but allows adjacent visits", () => {
    const first = createScheduledVisitFromInput(createScheduledVisitSchema.parse({ ...base, date: "2026-09-20", time: "10:00" }), "2026-09-15T12:00:00Z");
    const overlap = createScheduledVisitFromInput(createScheduledVisitSchema.parse({ ...base, clientAppointmentId: "22222222-2222-4222-8222-222222222222", date: "2026-09-20", time: "10:30" }), "2026-09-15T12:00:00Z");
    const adjacent = createScheduledVisitFromInput(createScheduledVisitSchema.parse({ ...base, clientAppointmentId: "33333333-3333-4333-8333-333333333333", date: "2026-09-20", time: "11:00" }), "2026-09-15T12:00:00Z");
    expect(appointmentsOverlap(first, overlap)).toBe(true);
    expect(appointmentsOverlap(first, adjacent)).toBe(false);
  });
});
