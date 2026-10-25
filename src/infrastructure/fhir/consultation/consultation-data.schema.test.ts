import { describe, expect, it } from "vitest";
import { consultationDataV1, appointmentDataV1, evaluationDataV1, readDataV1, ClinicalDataContractError } from "./consultation-data.schema";
const url = "https://example.invalid/fhir/consultation-data-v1";
const data = { id: "fake", patientId: "patient-fake", status: "open", contacts: [], noticesAndConsents: [], quotes: [], followUps: [], appointmentIds: [], createdAt: "2026-10-01T12:00:00Z" };
const ext = (value: unknown, extensionUrl = url) => [{ url: extensionUrl, valueString: JSON.stringify(value) }];
describe("versioned clinical extension contracts", () => {
 it("reads historical v1 and explicit v1 without metadata pollution", () => { expect(readDataV1(ext(data), url, consultationDataV1)).toEqual(data); expect(readDataV1(ext({ ...data, schemaVersion: 1, version: "stale" }), url, consultationDataV1)).toEqual(data); });
 it("rejects invalid, duplicated and unsupported versions", () => {
  for (const extensions of [ext({ ...data, status: "unknown" }), ext({ ...data, schemaVersion: 2 }), ext(data, url.replace("v1", "v2")), [...ext(data), ...ext(data)], [{ url, valueString: "broken" }]]) expect(() => readDataV1(extensions, url, consultationDataV1)).toThrow(ClinicalDataContractError);
  expect(readDataV1([], url, consultationDataV1)).toBeNull();
 });
 it("rejects appointments with inverted times and incomplete initial evaluations", () => {
  expect(appointmentDataV1.safeParse({ id: "fake", consultationId: "fake", patientId: "fake", status: "confirmed", scheduledDate: "2026-10-01", startsAt: "2026-10-01T13:00:00Z", endsAt: "2026-10-01T12:00:00Z", createdAt: "2026-10-01T12:00:00Z" }).success).toBe(false);
  expect(evaluationDataV1.safeParse({ id: "fake", patientId: "fake", assessment: "Ficticio" }).success).toBe(false);
 });
});
