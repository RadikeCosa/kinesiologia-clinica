import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import type { Consultation } from "@/domain/consultation/consultation";
import type { EvaluationAppointment } from "@/domain/consultation/consultation-appointment";
import { recordInitialEvaluation, closeConsultation, updateConsultationFollowUp } from "@/application/consultations/manage-consultations";
import { createScheduledVisit, ScheduleOverlapError } from "@/application/schedule/manage-scheduled-visits";
import { ConsultationConflictError, createFhirConsultationRepository } from "@/infrastructure/fhir/consultation/fhir-consultation.repository";
import { createFhirClient } from "@/infrastructure/fhir/core/fhir.client";
import { createFhirVisitRepository } from "@/infrastructure/fhir/encounter/fhir-visit.repository";
import { createFhirScheduledVisitRepository } from "@/infrastructure/fhir/appointment/fhir-scheduled-visit.repository";
import { createFhirPatientRepository } from "@/infrastructure/fhir/patient/fhir-patient.repository";
import { createFhirTreatmentRepository } from "@/infrastructure/fhir/episode-of-care/fhir-treatment.repository";
import { createFhirAgendaCoordinatorRepository } from "@/infrastructure/fhir/appointment/fhir-agenda-coordinator.repository";
import { firstPeriodId } from "@/infrastructure/fhir/periods/fhir-period.repository";

const SAFE_FHIR_DEV_URL = "http://localhost:8081/fhir";
const configuredUrl = process.env.FHIR_INTEGRATION_BASE_URL?.replace(/\/$/, "");
if (configuredUrl && configuredUrl !== SAFE_FHIR_DEV_URL) throw new Error(`FHIR integration tests are only allowed against ${SAFE_FHIR_DEV_URL}.`);
const describeIntegration = configuredUrl ? describe : describe.skip;
const cleanupResources: string[] = [];

async function cleanFixtures() {
  for (const resource of cleanupResources.splice(0)) {
    const response = await fetch(`${SAFE_FHIR_DEV_URL}/${resource}`, { method: "DELETE", headers: { Accept: "application/fhir+json" } });
    if (!response.ok && response.status !== 404 && response.status !== 410) throw new Error(`No se pudo limpiar un fixture FHIR (${response.status}).`);
  }
}

afterEach(cleanFixtures);

function consultation(id: string, patientId: string): Consultation {
  const now = "2026-10-15T12:00:00.000Z";
  return {
    id, patientId, status: "open",
    contacts: [{ id: `contact-${id}`, name: "Contacto Ficticio", relationship: "paciente", roles: ["requester", "patient", "data-subject"] }],
    noticesAndConsents: [], quotes: [], appointmentIds: [],
    followUps: [{ id: `follow-up-${id}`, dueAt: "2026-10-16T12:00:00.000Z", status: "pending", history: [] }],
    createdAt: now,
  };
}

describeIntegration("consultation intake FHIR contract", () => {
  it("persiste evaluación sin cita y rechaza escritura concurrente sin duplicar", async () => {
    const client = createFhirClient({ baseUrl: SAFE_FHIR_DEV_URL });
    const repository = createFhirConsultationRepository(client);
    const patientId = `fixture-intake-patient-${randomUUID()}`;
    const consultationId = `fixture-intake-${randomUUID()}`;
    const op = randomUUID();
    const evaluationId = `initial-evaluation-${op}`;
    cleanupResources.push(`Encounter/${evaluationId}`, `ServiceRequest/${consultationId}`, `Patient/${patientId}`);
    const created = await repository.create({ patient: { id: patientId, givenName: "Alias", familyName: "Ficticio" }, consultation: { ...consultation(consultationId, patientId), initialContext: { reason: "Relato ficticio", source: "family" } } });
    const input = { operationId: op, consultationId, expectedVersion: created.version!, startedAt: "2026-10-14T10:00:00Z", endedAt: "2026-10-14T10:50:00Z", reason: "Motivo ficticio", assessment: "Hallazgos ficticios", consentContactId: created.contacts[0].id, consentMethod: "verbal", consentAt: "2026-10-14T09:59:00Z", consentConfirmed: true };
    const deps = { consultations: repository };
    const results = await Promise.allSettled([recordInitialEvaluation(input, deps), recordInitialEvaluation(input, deps)]);
    expect(results.some(r => r.status === "fulfilled")).toBe(true);
    const saved = await repository.getById(consultationId);
    expect(saved).toMatchObject({ status: "evaluation-completed", initialContext: created.initialContext, quotes: [], appointmentIds: [], followUps: [{ status: "pending" }] });
    const encounter = await client.get<Record<string, unknown>>(`Encounter/${evaluationId}`);
    expect(encounter).not.toHaveProperty("appointment");
    expect(encounter).not.toHaveProperty("episodeOfCare");
    await expect(recordInitialEvaluation(input, deps)).resolves.toMatchObject({ evaluation: { id: evaluationId } });
    await expect(recordInitialEvaluation({ ...input, assessment: "Contenido distinto" }, deps)).rejects.toThrow("contenido diferente");
    expect((await repository.listActive()).some(item => item.id === consultationId)).toBe(true);
  });

  it("allows only one concurrent active consultation and leaves no losing resource", async () => {
    const clients = [createFhirClient({ baseUrl: SAFE_FHIR_DEV_URL }), createFhirClient({ baseUrl: SAFE_FHIR_DEV_URL })];
    const client = clients[0];
    const patientId = `fixture-intake-patient-${randomUUID()}`;
    const consultationIds = [randomUUID(), randomUUID()].map((id) => `fixture-intake-${id}`);
    cleanupResources.push(...consultationIds.map((id) => `ServiceRequest/${id}`), `Patient/${patientId}`);
    await client.put(`Patient/${patientId}`, { resourceType: "Patient", id: patientId, name: [{ given: ["Paciente"], family: "Ficticio" }] });

    const repositories = clients.map((independentClient) => createFhirConsultationRepository(independentClient));
    const results = await Promise.allSettled(repositories.map((repository, index) => repository.create({
      patient: { id: patientId, givenName: "Paciente", familyName: "Ficticio" },
      consultation: consultation(consultationIds[index], patientId),
    })));

    const winners = results.flatMap((result, index) => result.status === "fulfilled" ? [consultationIds[index]] : []);
    const losers = results.flatMap((result, index) => result.status === "rejected" ? [consultationIds[index]] : []);
    expect(winners).toHaveLength(1);
    expect(losers).toHaveLength(1);
    expect(results.find((result) => result.status === "rejected")).toMatchObject({ reason: expect.any(ConsultationConflictError) });
    await expect(client.get(`ServiceRequest/${winners[0]}`)).resolves.toMatchObject({ resourceType: "ServiceRequest" });
    await expect(client.get(`ServiceRequest/${losers[0]}`)).rejects.toThrow();
    const savedPatient = await client.get<{ extension?: Array<{ url?: string; valueString?: string }> }>(`Patient/${patientId}`);
    expect(savedPatient.extension?.find((item) => item.url?.endsWith("patient-active-consultation-v1"))?.valueString).toBe(winners[0]);
  });

  it("starts treatment, creates its first period and releases the active pointer in one HAPI transaction", async () => {
    const client = createFhirClient({ baseUrl: SAFE_FHIR_DEV_URL });
    const patientId = `fixture-treatment-start-patient-${randomUUID().slice(0, 12)}`;
    const consultationId = `fixture-treatment-start-${randomUUID()}`;
    const evaluationId = `fixture-initial-evaluation-${randomUUID()}`;
    const treatmentId = `fixture-treatment-${randomUUID()}`;
    const periodId = firstPeriodId(treatmentId);
    cleanupResources.push(`CarePlan/${periodId}`, `EpisodeOfCare/${treatmentId}`, `Encounter/${evaluationId}`, `ServiceRequest/${consultationId}`, `Patient/${patientId}`);
    await client.put(`Patient/${patientId}`, { resourceType: "Patient", id: patientId, name: [{ given: ["Paciente"], family: "Ficticio" }] });
    await client.put(`Encounter/${evaluationId}`, {
      resourceType: "Encounter", id: evaluationId, status: "finished",
      class: { system: "http://terminology.hl7.org/CodeSystem/v3-ActCode", code: "HH" },
      subject: { reference: `Patient/${patientId}` }, period: { start: "2026-10-15T12:00:00Z", end: "2026-10-15T12:50:00Z" },
    });

    const repository = createFhirConsultationRepository(client);
    const created = await repository.create({ patient: { id: patientId, givenName: "Paciente", familyName: "Ficticio" }, consultation: consultation(consultationId, patientId) });
    const evaluated = await repository.save({
      ...created, status: "evaluation-completed", initialEvaluationId: evaluationId,
      quotes: [{ id: "quote-treatment-v1", scope: "treatment", revision: 1, amount: 100, currency: "ARS", modality: "visita", communicatedAt: "2026-10-15T12:00:00.000Z", status: "accepted" }],
    }, created.version!);
    const treatment = {
      id: treatmentId, patientId, sourceConsultationId: consultationId, initialEvaluationId: evaluationId,
      acceptedTreatmentQuoteId: "quote-treatment-v1", status: "active" as const, startDate: "2026-10-15",
      plannedSessionCount: 8, plannedFrequency: "2 por semana", statusHistory: [{ status: "active" as const, startedAt: "2026-10-15T12:00:00.000Z" }],
    };
    await repository.startTreatmentFromConsultation({
      consultation: { ...evaluated, status: "treatment-started", treatmentId }, treatment, diagnoses: [], expectedVersion: evaluated.version!,
    });

    const savedConsultation = await client.get<{ status: string; extension?: Array<{ url?: string; valueString?: string }> }>(`ServiceRequest/${consultationId}`);
    const savedEpisode = await client.get<{ resourceType: string; extension?: Array<{ url?: string; valueString?: string; valueReference?: { reference?: string } }> }>(`EpisodeOfCare/${treatmentId}`);
    const savedPatient = await client.get<{ extension?: Array<{ url?: string; valueString?: string }> }>(`Patient/${patientId}`);
    await expect(client.get(`CarePlan/${periodId}`)).resolves.toMatchObject({ resourceType: "CarePlan" });
    expect(savedConsultation.status).toBe("completed");
    expect(savedConsultation.extension?.find((item) => item.url?.endsWith("service-request-consultation-data-v1"))?.valueString).toContain('"status":"treatment-started"');
    expect(savedEpisode.extension?.find((item) => item.url?.endsWith("treatment-origin-consultation-v1"))?.valueReference?.reference).toBe(`ServiceRequest/${consultationId}`);
    expect(savedEpisode.extension?.find((item) => item.url?.endsWith("treatment-initial-evaluation-v1"))?.valueReference?.reference).toBe(`Encounter/${evaluationId}`);
    expect(savedEpisode.extension?.find((item) => item.url?.endsWith("treatment-accepted-budget-v1"))?.valueString).toBe("quote-treatment-v1");
    expect(savedPatient.extension?.some((item) => item.url?.endsWith("patient-active-consultation-v1")) ?? false).toBe(false);
  });

  it("blocks closing an intake with an open evaluation appointment and leaves HAPI unchanged", async () => {
    const client = createFhirClient({ baseUrl: SAFE_FHIR_DEV_URL });
    const patientId = `fixture-close-appt-p-${randomUUID().slice(0, 12)}`;
    const consultationId = `fixture-close-appt-${randomUUID()}`;
    const appointmentId = `evaluation-appointment-${randomUUID()}`;
    cleanupResources.push(`Appointment/${appointmentId}`, `ServiceRequest/${consultationId}`, `Patient/${patientId}`);
    await client.put(`Patient/${patientId}`, { resourceType: "Patient", id: patientId, name: [{ given: ["Paciente"], family: "Ficticio" }] });
    const repository = createFhirConsultationRepository(client);
    const created = await repository.create({ patient: { id: patientId, givenName: "Paciente", familyName: "Ficticio" }, consultation: consultation(consultationId, patientId) });
    const appointment: EvaluationAppointment = {
      id: appointmentId, consultationId, patientId, status: "confirmed", scheduledDate: "2026-10-20",
      startsAt: "2026-10-20T13:00:00.000Z", endsAt: "2026-10-20T14:00:00.000Z", durationMinutes: 60,
      createdAt: "2026-10-15T12:00:00.000Z",
    };
    const withAppointment = await repository.saveWithEvaluationAppointments({ consultation: { ...created, status: "coordinating", appointmentIds: [appointmentId] }, appointments: [appointment], expectedVersion: created.version! });

    await expect(closeConsultation({ consultationId, expectedVersion: withAppointment.version!, reason: "withdrew", openAppointmentIds: [appointmentId], hasVisitInProgress: false, at: "2026-10-15T13:00:00.000Z" }, { consultations: repository })).rejects.toThrow("Primero resolvé las citas abiertas");

    await expect(repository.getById(consultationId)).resolves.toMatchObject({ status: "coordinating", appointmentIds: [appointmentId] });
    await expect(repository.getEvaluationAppointment(appointmentId)).resolves.toMatchObject({ status: "confirmed" });
    const patient = await client.get<{ extension?: Array<{ url?: string; valueString?: string }> }>(`Patient/${patientId}`);
    expect(patient.extension?.find((item) => item.url?.endsWith("patient-active-consultation-v1"))?.valueString).toBe(consultationId);
  });

  it("blocks closing while the patient's FHIR visit is in progress and leaves consultation unchanged", async () => {
    const client = createFhirClient({ baseUrl: SAFE_FHIR_DEV_URL });
    const patientId = `fixture-close-visit-p-${randomUUID().slice(0, 12)}`;
    const consultationId = `fixture-close-visit-${randomUUID()}`;
    const visitId = `fixture-close-enc-${randomUUID()}`;
    cleanupResources.push(`Encounter/${visitId}`, `ServiceRequest/${consultationId}`, `Patient/${patientId}`);
    await client.put(`Patient/${patientId}`, { resourceType: "Patient", id: patientId, name: [{ given: ["Paciente"], family: "Ficticio" }] });
    const consultations = createFhirConsultationRepository(client);
    const created = await consultations.create({ patient: { id: patientId, givenName: "Paciente", familyName: "Ficticio" }, consultation: consultation(consultationId, patientId) });
    await client.put(`Encounter/${visitId}`, {
      resourceType: "Encounter", id: visitId, status: "in-progress",
      class: { system: "http://terminology.hl7.org/CodeSystem/v3-ActCode", code: "HH" },
      subject: { reference: `Patient/${patientId}` }, period: { start: "2026-10-15T12:00:00.000Z" },
    });
    const visits = await createFhirVisitRepository(client).listByPatientId(patientId);

    await expect(closeConsultation({ consultationId, expectedVersion: created.version!, reason: "withdrew", openAppointmentIds: [], hasVisitInProgress: visits.some((item) => item.status === "in-progress"), at: "2026-10-15T13:00:00.000Z" }, { consultations })).rejects.toThrow("Primero resolvé las citas abiertas");

    await expect(consultations.getById(consultationId)).resolves.toMatchObject({ status: "open", followUps: [{ status: "pending" }] });
    const patient = await client.get<{ extension?: Array<{ url?: string; valueString?: string }> }>(`Patient/${patientId}`);
    expect(patient.extension?.find((item) => item.url?.endsWith("patient-active-consultation-v1"))?.valueString).toBe(consultationId);
  });

  it("rejects a stale close racing a follow-up edit from another client", async () => {
    const clients = [createFhirClient({ baseUrl: SAFE_FHIR_DEV_URL }), createFhirClient({ baseUrl: SAFE_FHIR_DEV_URL })];
    const patientId = `fixture-close-race-p-${randomUUID().slice(0, 12)}`;
    const consultationId = `fixture-close-race-${randomUUID()}`;
    cleanupResources.push(`ServiceRequest/${consultationId}`, `Patient/${patientId}`);
    await clients[0].put(`Patient/${patientId}`, { resourceType: "Patient", id: patientId, name: [{ given: ["Paciente"], family: "Ficticio" }] });
    const [closer, editor] = clients.map((client) => createFhirConsultationRepository(client));
    const created = await closer.create({ patient: { id: patientId, givenName: "Paciente", familyName: "Ficticio" }, consultation: consultation(consultationId, patientId) });
    const version = created.version!;
    const followUpId = created.followUps[0].id;
    const outcomes = await Promise.allSettled([
      closeConsultation({ consultationId, expectedVersion: version, reason: "withdrew", openAppointmentIds: [], hasVisitInProgress: false, at: "2026-10-15T13:00:00.000Z" }, { consultations: closer }),
      updateConsultationFollowUp({ consultationId, expectedVersion: version, followUpId, action: "reschedule", nextFollowUpAt: "2026-10-17T12:00:00.000Z", at: "2026-10-15T13:00:00.000Z" }, { consultations: editor }),
    ]);

    expect(outcomes.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const loser = outcomes.find((result) => result.status === "rejected");
    expect(loser).toMatchObject({ status: "rejected", reason: expect.any(ConsultationConflictError) });
    const saved = await closer.getById(consultationId);
    expect(saved?.status === "closed" || saved?.followUps[0].dueAt === "2026-10-17T12:00:00.000Z").toBe(true);
    if (saved?.status === "closed") expect(saved.followUps[0]).toMatchObject({ status: "cancelled" });
    if (saved?.followUps[0].dueAt === "2026-10-17T12:00:00.000Z") expect(saved.followUps[0]).toMatchObject({ status: "pending" });
    const patient = await clients[0].get<{ extension?: Array<{ url?: string; valueString?: string }> }>(`Patient/${patientId}`);
    const activeId = patient.extension?.find((item) => item.url?.endsWith("patient-active-consultation-v1"))?.valueString;
    expect(activeId).toBe(saved?.status === "closed" ? undefined : consultationId);
  });

  it("recovers a consultation committed by HAPI when the transaction response is lost", async () => {
    const patientId = `fixture-lost-reply-p-${randomUUID().slice(0, 12)}`;
    const clientId = randomUUID();
    const consultationId = `consultation-${clientId}`;
    cleanupResources.push(`ServiceRequest/${consultationId}`, `Patient/${patientId}`);
    const seedClient = createFhirClient({ baseUrl: SAFE_FHIR_DEV_URL });
    await seedClient.put(`Patient/${patientId}`, { resourceType: "Patient", id: patientId, name: [{ given: ["Paciente"], family: "Ficticio" }] });

    let loseTransactionResponse = true;
    const clientWithLostReply = createFhirClient({
      baseUrl: SAFE_FHIR_DEV_URL,
      fetcher: async (input, init) => {
        const response = await fetch(input, init);
        if (loseTransactionResponse && init?.method === "POST") {
          loseTransactionResponse = false;
          return new Response(JSON.stringify({ resourceType: "OperationOutcome" }), { status: 503, headers: { "Content-Type": "application/fhir+json" } });
        }
        return response;
      },
    });
    const repository = createFhirConsultationRepository(clientWithLostReply);
    const request = consultation(consultationId, patientId);
    await expect(repository.create({ patient: { id: patientId, givenName: "Paciente", familyName: "Ficticio" }, consultation: request })).rejects.toThrow("status 503");

    const retried = await repository.create({ patient: { id: patientId, givenName: "Paciente", familyName: "Ficticio" }, consultation: request });
    expect(retried.id).toBe(consultationId);
    const matches = await seedClient.get<{ total?: number; entry?: unknown[] }>(`ServiceRequest?${new URLSearchParams({ _id: consultationId })}`);
    expect(matches.total).toBe(1);
    await expect(repository.create({
      patient: { id: patientId, givenName: "Paciente", familyName: "Ficticio" },
      consultation: { ...request, contacts: [{ ...request.contacts[0], name: "Contenido ficticio distinto" }] },
    })).rejects.toThrow("misma operación se reintentó con datos diferentes");
  });

  it("detects an overlapping confirmed evaluation when scheduling a treatment visit", async () => {
    const client = createFhirClient({ baseUrl: SAFE_FHIR_DEV_URL });
    const patientId = `fixture-cross-agenda-p-${randomUUID().slice(0, 12)}`;
    const treatmentId = `fixture-cross-agenda-t-${randomUUID().slice(0, 12)}`;
    const consultationId = `fixture-cross-agenda-c-${randomUUID().slice(0, 12)}`;
    const evaluationAppointmentId = `evaluation-appointment-${randomUUID()}`;
    const treatmentAppointmentId = randomUUID();
    cleanupResources.push(`Appointment/${evaluationAppointmentId}`, `Appointment/appointment-${treatmentAppointmentId}`, `ServiceRequest/${consultationId}`, `EpisodeOfCare/${treatmentId}`, `Patient/${patientId}`);
    await client.put(`Patient/${patientId}`, { resourceType: "Patient", id: patientId, name: [{ given: ["Paciente"], family: "Ficticio" }] });
    await client.put(`EpisodeOfCare/${treatmentId}`, {
      resourceType: "EpisodeOfCare", id: treatmentId, status: "active", patient: { reference: `Patient/${patientId}` },
      period: { start: "2026-10-01" }, extension: [{ url: "https://kinesiologiaadomicilio.local/fhir/StructureDefinition/episodeofcare-planned-session-count-v1", valuePositiveInt: 8 }],
    });
    const consultations = createFhirConsultationRepository(client);
    const created = await consultations.create({ patient: { id: patientId, givenName: "Paciente", familyName: "Ficticio" }, consultation: consultation(consultationId, patientId) });
    const evaluationAppointment: EvaluationAppointment = {
      id: evaluationAppointmentId, consultationId, patientId, status: "confirmed", scheduledDate: "2026-10-20",
      startsAt: "2026-10-20T13:00:00.000Z", endsAt: "2026-10-20T14:00:00.000Z", durationMinutes: 60,
      createdAt: "2026-10-15T12:00:00.000Z",
    };
    await consultations.saveWithEvaluationAppointments({ consultation: { ...created, status: "coordinating", appointmentIds: [evaluationAppointmentId] }, appointments: [evaluationAppointment], expectedVersion: created.version! });
    const dependencies = {
      patients: createFhirPatientRepository(client), treatments: createFhirTreatmentRepository(client),
      scheduledVisits: createFhirScheduledVisitRepository(client), consultations,
      clock: { now: () => new Date("2026-10-15T12:00:00.000Z") },
    };
    const request = { clientAppointmentId: treatmentAppointmentId, patientId, treatmentId, date: "2026-10-20", time: "10:30", durationMinutes: 60 };

    const overlap = createScheduledVisit(request, dependencies);
    await expect(overlap).rejects.toBeInstanceOf(ScheduleOverlapError);
    await expect(overlap).rejects.toMatchObject({ conflicts: [expect.objectContaining({ id: evaluationAppointmentId })] });
    const accepted = await createScheduledVisit({ ...request, acknowledgeConflict: true }, dependencies);
    expect(accepted.id).toBe(`appointment-${treatmentAppointmentId}`);
  });

  it("serializes overlapping schedule writes through the versioned FHIR coordinator", async () => {
    const clients = [createFhirClient({ baseUrl: SAFE_FHIR_DEV_URL }), createFhirClient({ baseUrl: SAFE_FHIR_DEV_URL })];
    const raceDate = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }).format(new Date(Date.now() + 180 * 86_400_000));
    await clients[0].put("Device/clinical-agenda-coordinator", { resourceType: "Device", id: "clinical-agenda-coordinator", status: "active", type: { text: "Coordinador ficticio de agenda" } });
    await clients[0].put("Schedule/clinical-agenda-coordinator-v1", { resourceType: "Schedule", id: "clinical-agenda-coordinator-v1", active: true, actor: [{ reference: "Device/clinical-agenda-coordinator" }], serviceType: [{ text: "Agenda ficticia" }] });
    const fixtures = clients.map(() => ({ patientId: `fixture-agenda-race-p-${randomUUID().slice(0, 10)}`, treatmentId: `fixture-agenda-race-t-${randomUUID().slice(0, 10)}`, appointmentId: randomUUID() }));
    for (const fixture of fixtures) cleanupResources.push(`Appointment/appointment-${fixture.appointmentId}`, `EpisodeOfCare/${fixture.treatmentId}`, `Patient/${fixture.patientId}`);
    for (const [index, fixture] of fixtures.entries()) {
      await clients[index].put(`Patient/${fixture.patientId}`, { resourceType: "Patient", id: fixture.patientId, name: [{ given: ["Paciente"], family: "Ficticio" }] });
      await clients[index].put(`EpisodeOfCare/${fixture.treatmentId}`, {
        resourceType: "EpisodeOfCare", id: fixture.treatmentId, status: "active", patient: { reference: `Patient/${fixture.patientId}` },
        period: { start: "2026-10-01" }, extension: [{ url: "https://kinesiologiaadomicilio.local/fhir/StructureDefinition/episodeofcare-planned-session-count-v1", valuePositiveInt: 8 }],
      });
    }
    const dependencies = clients.map((client) => {
      const scheduledVisits = createFhirScheduledVisitRepository(client);
      return {
        patients: createFhirPatientRepository(client), treatments: createFhirTreatmentRepository(client),
        consultations: createFhirConsultationRepository(client),
        agendaCoordinator: createFhirAgendaCoordinatorRepository(client),
        scheduledVisits: {
          ...scheduledVisits,
          listOpen: () => scheduledVisits.listOpen(),
        },
        clock: { now: () => new Date("2026-10-15T12:00:00.000Z") },
      };
    });
    const results = await Promise.allSettled(fixtures.map((fixture, index) => createScheduledVisit({
      clientAppointmentId: fixture.appointmentId, patientId: fixture.patientId, treatmentId: fixture.treatmentId,
      date: raceDate, time: "10:00", durationMinutes: 60,
    }, dependencies[index])));

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toMatchObject([{ reason: expect.any(ScheduleOverlapError) }]);
    const savedIds = await Promise.all(fixtures.map(({ appointmentId }) => clients[0].get(`Appointment/appointment-${appointmentId}`).then(() => appointmentId, () => null)));
    expect(savedIds.filter(Boolean)).toHaveLength(1);
  }, 20_000);
});
