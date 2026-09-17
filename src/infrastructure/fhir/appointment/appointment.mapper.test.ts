import { describe, expect, it } from "vitest";
import { createScheduledVisitFromInput, createScheduledVisitSchema } from "@/domain/schedule/scheduled-visit";
import { mapFhirAppointment, mapScheduledVisitToFhir } from "./appointment.mapper";

const base = { clientAppointmentId: "11111111-1111-4111-8111-111111111111", patientId: "patient-1", treatmentId: "treatment-1", date: "2026-09-20", durationMinutes: 60, acknowledgeConflict: false };

describe("appointment mapper", () => {
  it("round trips a booked appointment with its treatment", () => {
    const visit = createScheduledVisitFromInput(createScheduledVisitSchema.parse({ ...base, time: "10:30" }), "2026-09-15T12:00:00Z");
    expect(mapFhirAppointment({ ...mapScheduledVisitToFhir(visit), meta: { versionId: "3" } })).toEqual({ ...visit, version: "3" });
  });

  it("reads the server update time separately from the scheduled date", () => {
    const visit = createScheduledVisitFromInput(createScheduledVisitSchema.parse({ ...base, time: "10:30" }), "2026-09-15T12:00:00Z");
    expect(mapFhirAppointment({ ...mapScheduledVisitToFhir(visit), status: "cancelled", meta: { versionId: "4", lastUpdated: "2026-09-21T13:15:00Z" } })).toMatchObject({
      scheduledDate: "2026-09-20",
      updatedAt: "2026-09-21T13:15:00Z",
    });
  });

  it("represents a date-only appointment as proposed requested period", () => {
    const visit = createScheduledVisitFromInput(createScheduledVisitSchema.parse(base), "2026-09-15T12:00:00Z");
    const resource = mapScheduledVisitToFhir(visit);
    expect(resource).toMatchObject({ status: "proposed", requestedPeriod: [{ start: "2026-09-20T00:00:00-03:00", end: "2026-09-21T00:00:00-03:00" }] });
    expect(resource.start).toBeUndefined();
  });
});
