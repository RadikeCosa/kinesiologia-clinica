import { describe, expect, it } from "vitest";
import { mapVisitToFhir } from "@/infrastructure/fhir/encounter/encounter.mapper";
import { validateR4 } from "./validate-r4";
if (process.env.FHIR_INTEGRATION_BASE_URL && process.env.FHIR_INTEGRATION_BASE_URL !== "http://localhost:8081/fhir") throw new Error("Only fictional HAPI 8081 allowed.");
const suite = process.env.FHIR_INTEGRATION_BASE_URL ? describe : describe.skip;
suite("Encounter structural R4 validation", () => {
 const visit = { id: "fake-visit", patientId: "fake-patient", treatmentId: "fake-treatment", status: "finished" as const, startedAt: "2026-10-01T12:00:00Z", endedAt: "2026-10-01T13:00:00Z", clinicalNote: { statusAndResponse: "Evolución ficticia", intervention: "Actividad ficticia" } };
 it("validates a new visit, correction and annulment", async () => {
  for (const v of [visit, { ...visit, correctedAt: "2026-10-02T12:00:00Z", correctionReason: "Corrección ficticia" }, { ...visit, status: "entered-in-error" as const, annulledAt: "2026-10-02T12:00:00Z", annulReason: "Anulación ficticia" }]) expect(await validateR4(mapVisitToFhir(v))).toEqual([]);
 }, 30000);
 it("detects the missing required R4 class instead of only accepting persistence", async () => {
  const resource = { ...mapVisitToFhir(visit), class: undefined };
  expect((await validateR4(resource)).length).toBeGreaterThan(0);
 }, 30000);
});
