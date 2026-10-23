import { describe, expect, it } from "vitest";
import { createFhirClient } from "@/infrastructure/fhir/core/fhir.client";
import { createFhirConsultationRepository } from "./fhir-consultation.repository";
import type { Consultation } from "@/domain/consultation/consultation";
import type { Patient } from "@/domain/patient/patient";
import type { EvaluationAppointment } from "@/domain/consultation/consultation-appointment";
import type { InitialEvaluation } from "@/domain/consultation/initial-evaluation";
import type { Treatment } from "@/domain/treatment/treatment";

function clientWithAtomicTransaction() {
  let patient: Record<string, unknown> = { resourceType: "Patient", id: "patient-1", name: [{ given: ["Paciente"], family: "Ficticio" }], meta: { versionId: "1" } };
  const requests = new Map<string, Record<string, unknown>>();
  const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/fhir+json" } });
  return createFhirClient({ baseUrl: "http://localhost:8081/fhir", fetcher: async (url, init) => {
    const requestUrl = typeof url === "string" ? url : url instanceof URL ? url.href : url.url;
    const path = new URL(requestUrl).pathname.replace("/fhir/", "");
    if (init?.method === "GET" && path.startsWith("Patient/")) return response(patient);
    if (init?.method === "GET" && path.startsWith("ServiceRequest/")) {
      const found = requests.get(path);
      return found ? response(found) : response({ resourceType: "OperationOutcome" }, 404);
    }
    if (init?.method === "GET" && path.startsWith("Appointment/")) {
      const found = requests.get(path);
      return found ? response(found) : response({ resourceType: "OperationOutcome" }, 404);
    }
    if (init?.method === "GET" && path.startsWith("Encounter/")) {
      const found = requests.get(path);
      return found ? response(found) : response({ resourceType: "OperationOutcome" }, 404);
    }
    if (init?.method === "GET" && (path.startsWith("Observation/") || path.startsWith("Procedure/"))) {
      const found = requests.get(path);
      return found ? response(found) : response({ resourceType: "OperationOutcome" }, 404);
    }
    if (init?.method === "GET" && (path.startsWith("EpisodeOfCare/") || path.startsWith("CarePlan/") || path.startsWith("Condition/"))) {
      const found = requests.get(path);
      return found ? response(found) : response({ resourceType: "OperationOutcome" }, 404);
    }
    if (init?.method === "PUT" && path.startsWith("Patient/")) {
      patient = { ...(JSON.parse(String(init.body)) as Record<string, unknown>), meta: { versionId: "1" } };
      return response(patient);
    }
    if (init?.method === "POST") {
      const bundle = JSON.parse(String(init.body)) as { entry: Array<{ resource: Record<string, unknown>; request: { url: string; ifMatch?: string } }> };
      const patientEntry = bundle.entry.find((entry) => entry.request.url.startsWith("Patient/"))!;
      const expected = patientEntry.request.ifMatch?.match(/"([^"]+)"/)?.[1];
      const currentVersion = ((patient.meta as { versionId: string }).versionId);
      if (expected !== currentVersion) return response({ resourceType: "OperationOutcome" }, 412);
      const nextPatientVersion = String(Number(currentVersion) + 1);
      patient = { ...patientEntry.resource, meta: { versionId: nextPatientVersion } };
      const entries = bundle.entry.filter((entry) => entry !== patientEntry);
      for (const entry of entries) {
        const key = entry.request.url;
        const previous = requests.get(key);
        if (entry.request.ifMatch && (!previous || entry.request.ifMatch !== `W/"${(previous.meta as { versionId: string }).versionId}"`)) return response({ resourceType: "OperationOutcome" }, 412);
      }
      for (const entry of entries) {
        const old = requests.get(entry.request.url);
        requests.set(entry.request.url, { ...entry.resource, meta: { versionId: old ? String(Number((old.meta as { versionId: string }).versionId) + 1) : "1" } });
      }
      return response({ resourceType: "Bundle", type: "transaction-response", entry: [] });
    }
    return response({ resourceType: "OperationOutcome" }, 400);
  } });
}

const patient: Patient = { id: "patient-1", givenName: "Paciente", familyName: "Ficticio", version: "1" };
function consultation(id: string): Consultation {
  return { id, patientId: patient.id, status: "open", contacts: [], noticesAndConsents: [], quotes: [], followUps: [], appointmentIds: [], createdAt: "2026-10-15T12:00:00.000Z" };
}

describe("FHIR consultation repository", () => {
  it("serializes concurrent new consultations through the Patient version in one transaction", async () => {
    const client = clientWithAtomicTransaction();
    const first = createFhirConsultationRepository(client);
    const second = createFhirConsultationRepository(client);
    const results = await Promise.allSettled([
      first.create({ patient, consultation: consultation("consultation-a") }),
      second.create({ patient, consultation: consultation("consultation-b") }),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
  });

  it("returns the saved consultation after a same-idempotency retry", async () => {
    const client = clientWithAtomicTransaction();
    const repository = createFhirConsultationRepository(client);
    const created = await repository.create({ patient, consultation: consultation("consultation-a") });
    const retried = await repository.create({ patient, consultation: consultation("consultation-a") });
    expect(retried.id).toBe(created.id);
    expect(retried.patientId).toBe(patient.id);
  });

  it("rejects reuse of an idempotency key with a different contact", async () => {
    const client = clientWithAtomicTransaction();
    const repository = createFhirConsultationRepository(client);
    await repository.create({ patient, consultation: consultation("consultation-a") });
    await expect(repository.create({ patient, consultation: { ...consultation("consultation-a"), contacts: [{ id: "other", name: "Otra persona", relationship: "Paciente", roles: ["requester"] }] } })).rejects.toThrow("datos diferentes");
  });

  it("saves an evaluation appointment with its consultation and patient lock in one transaction", async () => {
    const client = clientWithAtomicTransaction();
    const repository = createFhirConsultationRepository(client);
    const created = await repository.create({ patient, consultation: consultation("consultation-eval") });
    const appointment: EvaluationAppointment = {
      id: "evaluation-appointment-9e3cd0e7-45b5-45f9-8d82-c7e2842fd99d", consultationId: created.id, patientId: patient.id,
      status: "confirmed", scheduledDate: "2026-10-20", startsAt: "2026-10-20T10:00:00-03:00", endsAt: "2026-10-20T11:00:00.000Z",
      durationMinutes: 60, createdAt: "2026-10-15T12:00:00.000Z",
    };
    const saved = await repository.saveWithEvaluationAppointments({ consultation: { ...created, appointmentIds: [appointment.id] }, appointments: [appointment], expectedVersion: created.version! });
    expect(saved.appointmentIds).toEqual([appointment.id]);
    await expect(repository.getEvaluationAppointment(appointment.id)).resolves.toMatchObject({ id: appointment.id, patientId: patient.id, consultationId: created.id, status: "confirmed" });
  });

  it("completes the evaluation in one transaction without an EpisodeOfCare", async () => {
    const client = clientWithAtomicTransaction();
    const repository = createFhirConsultationRepository(client);
    const created = await repository.create({ patient, consultation: consultation("consultation-evaluation") });
    const appointment: EvaluationAppointment = {
      id: "evaluation-appointment-9e3cd0e7-45b5-45f9-8d82-c7e2842fd99d", consultationId: created.id, patientId: patient.id,
      status: "confirmed", scheduledDate: "2026-10-20", startsAt: "2026-10-20T10:00:00-03:00", endsAt: "2026-10-20T11:00:00-03:00",
      durationMinutes: 60, createdAt: "2026-10-15T12:00:00.000Z",
    };
    const scheduled = await repository.saveWithEvaluationAppointments({ consultation: { ...created, appointmentIds: [appointment.id] }, appointments: [appointment], expectedVersion: created.version! });
    const confirmedAppointment = await repository.getEvaluationAppointment(appointment.id);
    const evaluation: InitialEvaluation = {
      id: "initial-evaluation-79ec72ca-c776-419d-8e1b-a3b5e6d08b9e", consultationId: created.id, appointmentId: appointment.id,
      patientId: patient.id, startedAt: "2026-10-20T10:05:00-03:00", endedAt: "2026-10-20T10:55:00-03:00",
      reason: "Motivo ficticio", assessment: "Evaluación ficticia", clinicalEntries: {
        evaluations: [{ clientId: "4bfa0a7b-c75c-43ab-830e-38ae478871b7", seriesId: "b60549ba-4bfe-4084-a65f-6bdf9aa50fbc", domain: "gait-mobility", name: "Marcha ficticia", result: { kind: "narrative", value: "Observación ficticia" } }],
        symptoms: [], procedures: [],
      }, recordedAt: "2026-10-20T14:00:00.000Z",
    };
    const finished = await repository.completeInitialEvaluation({
      consultation: { ...scheduled, status: "evaluation-completed", initialEvaluationId: evaluation.id },
      appointment: { ...confirmedAppointment!, status: "realized" }, evaluation, expectedVersion: scheduled.version!,
    });
    expect(finished.status).toBe("evaluation-completed");
    const savedEvaluation = await repository.getInitialEvaluation(evaluation.id);
    expect(savedEvaluation).toMatchObject({ id: evaluation.id, patientId: patient.id, appointmentId: appointment.id });
    const encounter = await client.get<Record<string, unknown>>(`Encounter/${evaluation.id}`);
    expect(encounter).not.toHaveProperty("episodeOfCare");
    await expect(client.get<Record<string, unknown>>("Observation/evaluation-4bfa0a7b-c75c-43ab-830e-38ae478871b7")).resolves.toMatchObject({ resourceType: "Observation", encounter: { reference: `Encounter/${evaluation.id}` } });
  });

  it("creates the treatment and first period while releasing the patient consultation pointer atomically", async () => {
    const client = clientWithAtomicTransaction();
    const repository = createFhirConsultationRepository(client);
    const created = await repository.create({ patient, consultation: consultation("consultation-start") });
    const treatment: Treatment = { id: "treatment-39d0211a-b45e-44f7-bae9-26918ddbf822", patientId: patient.id, sourceConsultationId: created.id, initialEvaluationId: "initial-evaluation-1", acceptedTreatmentQuoteId: "quote-treatment-v1", status: "active", startDate: "2026-10-21", plannedSessionCount: 8, plannedFrequency: "2 por semana", statusHistory: [{ status: "active", startedAt: "2026-10-21T12:00:00.000Z" }] };
    const intake = { ...created, initialEvaluationId: "initial-evaluation-1", quotes: [{ id: "quote-treatment-v1", scope: "treatment" as const, revision: 1, amount: 100, currency: "ARS", modality: "visita", communicatedAt: "2026-10-20T12:00:00.000Z", status: "accepted" as const }] };
    const saved = await repository.startTreatmentFromConsultation({
      consultation: { ...intake, status: "treatment-started", treatmentId: treatment.id }, treatment, diagnoses: [], expectedVersion: created.version!,
    });
    expect(saved.status).toBe("treatment-started");
    const episode = await client.get<Record<string, unknown>>(`EpisodeOfCare/${treatment.id}`);
    expect(episode.resourceType).toBe("EpisodeOfCare");
    const extensions = episode.extension as Array<{ url: string; valueString?: string }>;
    expect(extensions.some((item) => item.url.endsWith("treatment-origin-consultation-v1"))).toBe(true);
    expect(extensions.some((item) => item.url.endsWith("treatment-initial-evaluation-v1"))).toBe(true);
    expect(extensions.find((item) => item.url.endsWith("treatment-accepted-budget-v1"))?.valueString).toBe("quote-treatment-v1");
    const periodId = extensions.find((item) => item.url.endsWith("episodeofcare-current-period-v1"))?.valueString;
    expect(periodId).toBeTruthy();
    await expect(client.get<Record<string, unknown>>(`CarePlan/${periodId}`)).resolves.toMatchObject({ resourceType: "CarePlan" });
    const savedPatient = await client.get<Record<string, unknown>>("Patient/patient-1");
    expect(savedPatient.extension).not.toEqual(expect.arrayContaining([expect.objectContaining({ url: expect.stringContaining("patient-active-consultation") })]));
  });
});
