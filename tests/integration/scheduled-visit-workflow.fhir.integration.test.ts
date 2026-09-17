import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { closeScheduledVisit, createScheduledVisit, rescheduleVisit } from "@/application/schedule/manage-scheduled-visits";
import { finishVisit, startVisit } from "@/application/visits/manage-visit-workflow";
import { deriveDocumentationTimeliness, deriveStartPunctuality } from "@/domain/visit/visit-timeliness";
import { createFhirScheduledVisitRepository } from "@/infrastructure/fhir/appointment/fhir-scheduled-visit.repository";
import { createFhirClient } from "@/infrastructure/fhir/core/fhir.client";
import { createFhirTreatmentRepository } from "@/infrastructure/fhir/episode-of-care/fhir-treatment.repository";
import { createFhirClinicalWorkflowRepository } from "@/infrastructure/fhir/encounter/fhir-clinical-workflow.repository";
import { createFhirVisitRepository } from "@/infrastructure/fhir/encounter/fhir-visit.repository";
import { createFhirMetricRepository } from "@/infrastructure/fhir/observation/fhir-metric.repository";
import { createFhirPatientRepository } from "@/infrastructure/fhir/patient/fhir-patient.repository";

const SAFE_FHIR_DEV_URL = "http://localhost:8081/fhir";
const configuredUrl = process.env.FHIR_INTEGRATION_BASE_URL?.replace(/\/$/, "");
if (configuredUrl && configuredUrl !== SAFE_FHIR_DEV_URL) throw new Error(`FHIR integration tests are only allowed against ${SAFE_FHIR_DEV_URL}.`);
const describeIntegration = configuredUrl ? describe : describe.skip;
let cleanupResources: string[] = [];

async function cleanAgendaFixtures() {
  for (const resource of cleanupResources) {
    const response = await fetch(`${SAFE_FHIR_DEV_URL}/${resource}`, { method: "DELETE", headers: { Accept: "application/fhir+json" } });
    if (!response.ok && response.status !== 404 && response.status !== 410) throw new Error(`No se pudo limpiar ${resource}.`);
  }
  cleanupResources = [];
}

afterEach(cleanAgendaFixtures);

describeIntegration("scheduled visit and encounter FHIR contract", () => {
  it("keeps appointment history and completes the linked encounter without duplicates", async () => {
    const client = createFhirClient({ baseUrl: SAFE_FHIR_DEV_URL });
    const suffix = randomUUID().slice(0, 8);
    const patientId = `fixture-agenda-patient-${suffix}`;
    const treatmentId = `fixture-agenda-treatment-${suffix}`;
    const appointmentIds = [randomUUID(), randomUUID(), randomUUID(), randomUUID(), randomUUID()] as const;
    cleanupResources = [
      `Observation/obs-${appointmentIds[1]}-pain-nrs-0-10`,
      `Encounter/visit-${appointmentIds[1]}`,
      `Encounter/visit-${appointmentIds[4]}`,
      ...appointmentIds.map((id) => `Appointment/appointment-${id}`),
      `EpisodeOfCare/${treatmentId}`,
      `Patient/${patientId}`,
    ];
    await client.put(`Patient/${patientId}`, { resourceType: "Patient", id: patientId, name: [{ family: "Agenda", given: ["Ficticia"] }] });
    await client.put(`EpisodeOfCare/${treatmentId}`, { resourceType: "EpisodeOfCare", id: treatmentId, status: "active", patient: { reference: `Patient/${patientId}` }, period: { start: "2026-09-01" } });

    const dependencies = {
      patients: createFhirPatientRepository(client), treatments: createFhirTreatmentRepository(client),
      scheduledVisits: createFhirScheduledVisitRepository(client), visits: createFhirVisitRepository(client),
      metrics: createFhirMetricRepository(client), workflow: createFhirClinicalWorkflowRepository(client),
      clock: { now: () => new Date("2026-09-15T12:00:00.000Z") },
    };
    const createInput = { clientAppointmentId: appointmentIds[0], patientId, treatmentId, date: "2026-09-16", time: "10:00", durationMinutes: 60, acknowledgeConflict: true };
    const created = await createScheduledVisit(createInput, dependencies);
    const retry = await createScheduledVisit(createInput, dependencies);
    expect(retry.id).toBe(created.id);
    expect((await dependencies.scheduledVisits.listByPatientId(patientId)).filter((item) => item.id === created.id)).toHaveLength(1);

    const rescheduleInput = { ...createInput, appointmentId: created.id, expectedVersion: created.version!, clientAppointmentId: appointmentIds[1], date: "2026-09-17", time: "11:00", reason: "patient-or-family" as const };
    const moved = await rescheduleVisit(rescheduleInput, dependencies);
    const movedRetry = await rescheduleVisit(rescheduleInput, dependencies);
    expect(moved.original.status).toBe("cancelled");
    expect(moved.original.replacedById).toBe(moved.replacement.id);
    expect(movedRetry.replacement.id).toBe(moved.replacement.id);

    dependencies.clock.now = () => new Date("2026-09-17T14:10:00.000Z");
    const started = await startVisit({ clientVisitId: "55555555-5555-4555-8555-555555555555", patientId, treatmentId, appointmentId: moved.replacement.id }, dependencies);
    expect(started.appointmentId).toBe(moved.replacement.id);
    expect((await dependencies.scheduledVisits.getById(moved.replacement.id))?.status).toBe("fulfilled");

    dependencies.clock.now = () => new Date("2026-09-17T15:00:00.000Z");
    const finished = await finishVisit({ visitId: started.id, expectedVersion: started.version!, clinicalNote: { statusAndResponse: "Estado y respuesta ficticios", intervention: "Intervención ficticia" }, metrics: [{ code: "pain_nrs_0_10", value: 2 }] }, dependencies);
    const finishRetry = await finishVisit({ visitId: started.id, expectedVersion: started.version!, clinicalNote: { statusAndResponse: "Estado y respuesta ficticios", intervention: "Intervención ficticia" }, metrics: [{ code: "pain_nrs_0_10", value: 2 }] }, dependencies);
    expect(finishRetry.visit.id).toBe(finished.visit.id);
    expect(finished.metrics.filter((item) => item.code === "pain_nrs_0_10")).toHaveLength(1);
    expect(deriveStartPunctuality(finished.visit, moved.replacement)).toBe("on-time");
    expect(deriveDocumentationTimeliness(finished.visit)).toBe("at-the-time");

    const cancelled = await createScheduledVisit({ ...createInput, clientAppointmentId: appointmentIds[2], date: "2026-09-18" }, dependencies);
    await closeScheduledVisit({ appointmentId: cancelled.id, expectedVersion: cancelled.version!, reason: "professional" }, "cancelled", dependencies);
    expect((await dependencies.scheduledVisits.getById(cancelled.id))?.status).toBe("cancelled");

    const missed = await createScheduledVisit({ ...createInput, clientAppointmentId: appointmentIds[3], date: "2026-09-19", time: "09:00" }, dependencies);
    dependencies.clock.now = () => new Date("2026-09-19T13:30:00.000Z");
    await closeScheduledVisit({ appointmentId: missed.id, expectedVersion: missed.version!, reason: "patient-or-family" }, "no-show", dependencies);
    expect((await dependencies.scheduledVisits.getById(missed.id))?.status).toBe("no-show");

    const untimed = await createScheduledVisit({ ...createInput, clientAppointmentId: appointmentIds[4], date: "2026-09-20", time: undefined }, dependencies);
    dependencies.clock.now = () => new Date("2026-09-20T13:30:00.000Z");
    const untimedVisit = await startVisit({ clientVisitId: randomUUID(), patientId, treatmentId, appointmentId: untimed.id }, dependencies);
    const fulfilledUntimed = await dependencies.scheduledVisits.getById(untimed.id);
    expect(fulfilledUntimed).toMatchObject({ status: "fulfilled", startsAt: undefined });
    expect(deriveStartPunctuality(untimedVisit, fulfilledUntimed)).toBeUndefined();
  });
});
