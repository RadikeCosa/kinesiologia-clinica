import { describe, expect, it, vi } from "vitest";
import type { Consultation } from "@/domain/consultation/consultation";
import type { ConsultationRepository } from "./consultation.repository";
import { authorizeThirdPartyDisclosure, closeConsultation, createConsultation, issueConsultationQuote, recordInitialEvaluation, respondToConsultationQuote, revokeThirdPartyDisclosure, scheduleConsultationEvaluation, startTreatmentFromConsultation, updateConsultationFollowUp } from "./manage-consultations";

const base = (overrides: Partial<Consultation> = {}): Consultation => ({
  id: "consultation-1", patientId: "patient-1", status: "open", version: "4", createdAt: "2026-10-15T12:00:00.000Z",
  contacts: [{ id: "requester-1", name: "Contacto Ficticio", relationship: "Familiar", roles: ["requester", "coordination-contact", "budget-acceptor"] }],
  noticesAndConsents: [], quotes: [], followUps: [{ id: "f1", dueAt: "2026-10-16T12:00:00.000Z", status: "pending", history: [] }], appointmentIds: [],
  ...overrides,
});
function dependencies(consultation = base()) {
  const consultations: ConsultationRepository = {
    create: vi.fn(async ({ consultation: created }) => ({ ...created, version: "1" })),
    getById: vi.fn(async () => consultation),
    save: vi.fn(async (saved) => ({ ...saved, version: "5" })),
    saveWithEvaluationAppointments: vi.fn(async ({ consultation: saved }) => ({ ...saved, version: "5" })),
    getEvaluationAppointment: vi.fn(async () => null),
    completeInitialEvaluation: vi.fn(async ({ consultation: saved }) => ({ ...saved, version: "6" })),
    getInitialEvaluation: vi.fn(async () => null),
    startTreatmentFromConsultation: vi.fn(async ({ consultation: saved }) => ({ ...saved, version: "7" })),
    listActive: vi.fn(async () => [consultation]),
    listByPatientId: vi.fn(async () => [consultation]),
  };
  return { consultations, patients: { getById: vi.fn(async () => null) }, clock: { now: () => new Date("2026-10-15T12:00:00.000Z") } };
}

describe("consulta de ingreso", () => {
  it("mantiene separados paciente y familiar solicitante y permite ficha progresiva", async () => {
    const services = dependencies();
    const result = await createConsultation({
      initialReason: "Relato inventado", initialSource: "family",
      clientId: "43f784f3-105e-4a5f-8616-6cf763ac9300", patientGivenName: "Paciente Ficticio", patientFamilyName: "Ejemplo",
      contact: { id: "95e3ccef-342f-4bc8-a27b-4d56038fdade", name: "Familiar Ficticio", relationship: "Familiar", roles: ["requester", "coordination-contact"] },
      patientContactId: "697903d7-e76c-4fd3-a6ea-e1b7293e65a1", patientContactName: "Paciente Ficticio Ejemplo", contactIsPatient: false,
      dataNoticeRequesterGiven: true, dataNoticePatientGiven: true,
      dataNoticeAt: "2026-10-15T12:00:00.000Z", nextFollowUpAt: "2026-10-16T12:00:00.000Z",
    }, services);
    expect(result.initialContext).toEqual({ reason: "Relato inventado", source: "family" });
    expect(result.contacts).toHaveLength(2);
    expect(result.contacts[0].roles).toContain("requester");
    expect(result.noticesAndConsents.map((notice) => notice.subjectContactId)).toEqual(["95e3ccef-342f-4bc8-a27b-4d56038fdade", "697903d7-e76c-4fd3-a6ea-e1b7293e65a1"]);
    expect(services.consultations.create).toHaveBeenCalledOnce();
  });

  it("no permite representar al paciente sin fundamento registrado", async () => {
    await expect(createConsultation({
      clientId: "43f784f3-105e-4a5f-8616-6cf763ac9300",
      contact: { id: "95e3ccef-342f-4bc8-a27b-4d56038fdade", name: "Contacto", relationship: "Familiar", roles: ["legal-representative"] },
      dataNoticeRequesterGiven: true, dataNoticeAt: "2026-10-15T12:00:00.000Z", nextFollowUpAt: "2026-10-16T12:00:00.000Z",
    }, dependencies())).rejects.toThrow("fundamento de representación");
  });

  it("registra una autorización de comunicación del paciente con destinatario y alcance explícitos", async () => {
    const patientId = "697903d7-e76c-4fd3-a6ea-e1b7293e65a1";
    const consultation = base({ contacts: [
      { id: patientId, name: "Paciente Ficticio", relationship: "Paciente", roles: ["patient", "data-subject"] },
      { id: "95e3ccef-342f-4bc8-a27b-4d56038fdade", name: "Familiar Ficticio", relationship: "Hermana", roles: ["requester"] },
    ] });
    const services = dependencies(consultation);
    const saved = await authorizeThirdPartyDisclosure({
      consultationId: consultation.id, expectedVersion: "4", recipientContactId: "50858cfb-298f-4e1f-a7ed-f7e8a0e323bc",
      recipientName: "Familiar Ficticio", relationship: "Hermana", actorContactId: patientId,
      method: "verbal", at: "2026-10-15T12:00:00.000Z", scope: "Coordinar horarios, sin compartir información clínica",
    }, services);
    expect(saved.contacts.at(-1)).toMatchObject({ roles: ["authorized-recipient"] });
    expect(saved.noticesAndConsents.at(-1)).toMatchObject({
      kind: "third-party-disclosure", subjectContactId: patientId, actorContactId: patientId,
      recipientContactId: "50858cfb-298f-4e1f-a7ed-f7e8a0e323bc", capacity: "self", scope: "Coordinar horarios, sin compartir información clínica",
    });
  });

  it("no acepta una autorización clínica otorgada solo por parentesco", async () => {
    const consultation = base({ contacts: [
      { id: "697903d7-e76c-4fd3-a6ea-e1b7293e65a1", name: "Paciente Ficticio", relationship: "Paciente", roles: ["patient", "data-subject"] },
      { id: "95e3ccef-342f-4bc8-a27b-4d56038fdade", name: "Familiar Ficticio", relationship: "Hermana", roles: ["requester"] },
    ] });
    await expect(authorizeThirdPartyDisclosure({
      consultationId: consultation.id, expectedVersion: "4", recipientContactId: "50858cfb-298f-4e1f-a7ed-f7e8a0e323bc",
      recipientName: "Otro Familiar", relationship: "Madre", actorContactId: "95e3ccef-342f-4bc8-a27b-4d56038fdade",
      method: "verbal", at: "2026-10-15T12:00:00.000Z", scope: "Información clínica",
    }, dependencies(consultation))).rejects.toThrow("representante con fundamento");
  });

  it("revoca una autorización sin borrar el registro original y no permite revocarla dos veces", async () => {
    const patientId = "697903d7-e76c-4fd3-a6ea-e1b7293e65a1";
    const authorizationId = "50858cfb-298f-4e1f-a7ed-f7e8a0e323bc";
    const recipientId = "95e3ccef-342f-4bc8-a27b-4d56038fdade";
    const consultation = base({ contacts: [
      { id: patientId, name: "Paciente Ficticio", relationship: "Paciente", roles: ["patient", "data-subject"] },
      { id: recipientId, name: "Familiar Ficticio", relationship: "Hermana", roles: ["authorized-recipient"] },
    ], noticesAndConsents: [{ id: authorizationId, kind: "third-party-disclosure", subjectContactId: patientId, actorContactId: patientId, recipientContactId: recipientId, capacity: "self", at: "2026-10-15T11:00:00.000Z", method: "verbal", scope: "Coordinar visitas" }] });
    const services = dependencies(consultation);
    const revoked = await revokeThirdPartyDisclosure({
      consultationId: consultation.id, expectedVersion: "4", authorizationId, actorContactId: patientId,
      method: "verbal", at: "2026-10-15T12:00:00.000Z", reason: "El paciente pidió detener la comunicación",
    }, services);
    expect(revoked.noticesAndConsents).toHaveLength(2);
    expect(revoked.noticesAndConsents[0]).toMatchObject({ id: authorizationId, kind: "third-party-disclosure" });
    expect(revoked.noticesAndConsents[1]).toMatchObject({ kind: "third-party-disclosure-revocation", relatedEvidenceId: authorizationId, recipientContactId: recipientId });
    await expect(revokeThirdPartyDisclosure({
      consultationId: consultation.id, expectedVersion: "5", authorizationId, actorContactId: patientId,
      method: "verbal", at: "2026-10-15T12:01:00.000Z", reason: "Reintento",
    }, dependencies(revoked))).rejects.toThrow("ya fue revocada");
  });

  it("crea nuevas versiones sin borrar la respuesta de la anterior", async () => {
    const consultation = base({ quotes: [{ id: "q1", scope: "treatment", revision: 1, amount: 100, currency: "ARS", modality: "visita", communicatedAt: "2026-10-15T10:00:00.000Z", status: "rejected", responseAt: "2026-10-15T11:00:00.000Z" }] });
    const services = dependencies(consultation);
    await issueConsultationQuote({ consultationId: consultation.id, expectedVersion: "4", scope: "treatment", amount: 120, currency: "ARS", modality: "visita", communicatedAt: "2026-10-15T12:00:00.000Z", nextFollowUpAt: "2026-10-16T12:00:00.000Z" }, services);
    const saved = vi.mocked(services.consultations.save).mock.calls[0][0];
    expect(saved.quotes[0].status).toBe("rejected");
    expect(saved.quotes[0].supersededAt).toBe("2026-10-15T12:00:00.000Z");
    expect(saved.quotes[1].revision).toBe(2);
  });

  it("exige que responda una persona habilitada y rechazar no cierra la consulta", async () => {
    const consultation = base({ quotes: [{ id: "q1", scope: "initial-evaluation", revision: 1, amount: 0, currency: "ARS", modality: "sin cargo", communicatedAt: "2026-10-15T10:00:00.000Z", status: "pending" }] });
    const services = dependencies(consultation);
    const rejected = await respondToConsultationQuote({ consultationId: consultation.id, expectedVersion: "4", quoteId: "q1", response: "rejected", contactId: "requester-1", at: "2026-10-15T12:00:00.000Z", nextFollowUpAt: "2026-10-16T12:00:00.000Z" }, services);
    expect(rejected.status).toBe("open");
    expect(rejected.followUps[0].status).toBe("completed");
    expect(rejected.followUps.at(-1)?.status).toBe("pending");
    const acceptedServices = dependencies(consultation);
    const accepted = await respondToConsultationQuote({ consultationId: consultation.id, expectedVersion: "4", quoteId: "q1", response: "accepted", contactId: "requester-1", at: "2026-10-15T12:00:00.000Z", nextFollowUpAt: "2026-10-16T12:00:00.000Z" }, acceptedServices);
    expect(accepted.status).toBe("coordinating");
    expect(accepted.noticesAndConsents.at(-1)?.kind).toBe("budget-acceptance");
    await expect(respondToConsultationQuote({ consultationId: consultation.id, expectedVersion: "4", quoteId: "q1", response: "accepted", contactId: "unknown", at: "2026-10-15T12:00:00.000Z", nextFollowUpAt: "2026-10-16T12:00:00.000Z" }, services)).rejects.toThrow("no está registrada");
  });

  it("bloquea el cierre con citas abiertas y conserva los seguimientos cancelados", async () => {
    const services = dependencies();
    await expect(closeConsultation({ consultationId: "consultation-1", expectedVersion: "4", reason: "withdrew", openAppointmentIds: ["appointment-1"], hasVisitInProgress: false, at: "2026-10-15T12:00:00.000Z" }, services)).rejects.toThrow("citas abiertas");
    const closed = await closeConsultation({ consultationId: "consultation-1", expectedVersion: "4", reason: "no-response", openAppointmentIds: [], hasVisitInProgress: false, at: "2026-10-15T12:00:00.000Z" }, services);
    expect(closed.status).toBe("closed");
    expect(closed.followUps[0].status).toBe("cancelled");
    expect(closed.followUps[0].history[0].event).toBe("cancelled");
  });

  it("reprograma el seguimiento conservando fecha anterior y permite completarlo o cancelarlo con motivo", async () => {
    const services = dependencies();
    const moved = await updateConsultationFollowUp({
      consultationId: "consultation-1", expectedVersion: "4", followUpId: "f1", action: "reschedule",
      at: "2026-10-15T12:00:00.000Z", nextFollowUpAt: "2026-10-18T12:00:00.000Z",
    }, services);
    expect(moved.followUps[0]).toMatchObject({ status: "pending", dueAt: "2026-10-18T12:00:00.000Z" });
    expect(moved.followUps[0]?.history[0]?.detail).toContain("2026-10-16T12:00:00.000Z");

    const completed = await updateConsultationFollowUp({
      consultationId: "consultation-1", expectedVersion: "4", followUpId: "f1", action: "complete",
      at: "2026-10-18T12:00:00.000Z", resultOrReason: "Se coordinó la evaluación ficticia.",
    }, services);
    expect(completed.followUps[0]).toMatchObject({ status: "completed", resultOrReason: "Se coordinó la evaluación ficticia." });
    await expect(updateConsultationFollowUp({
      consultationId: "consultation-1", expectedVersion: "4", followUpId: "f1", action: "cancel",
      at: "2026-10-18T12:00:00.000Z",
    }, services)).rejects.toThrow("motivo para cancelar");
  });

  it("coordina evaluación sin tratamiento solo con presupuesto vigente aceptado", async () => {
    const consultation = base({ status: "coordinating", quotes: [{ id: "q-eval", scope: "initial-evaluation", revision: 1, amount: 0, currency: "ARS", modality: "evaluación inicial", communicatedAt: "2026-10-15T10:00:00.000Z", status: "accepted", responseAt: "2026-10-15T11:00:00.000Z", acceptedByContactId: "requester-1" }] });
    const services = dependencies(consultation);
    const created = await scheduleConsultationEvaluation({ consultationId: consultation.id, expectedVersion: "4", clientAppointmentId: "c42288cb-eef5-4461-a92a-c595591213c4", scheduledDate: "2026-10-20", startsAt: "2026-10-20T10:00:00-03:00", durationMinutes: 60 }, services);
    expect(created.appointment.status).toBe("confirmed");
    expect(created.appointment.patientId).toBe("patient-1");
    expect(created.consultation.appointmentIds).toContain(created.appointment.id);
    expect(services.consultations.saveWithEvaluationAppointments).toHaveBeenCalledOnce();
    expect("treatmentId" in created.appointment).toBe(false);
  });

  it("rechaza coordinar una evaluación con presupuesto pendiente o consulta en estado incorrecto", async () => {
    const consultation = base({ quotes: [{ id: "q-eval", scope: "initial-evaluation", revision: 1, amount: 1, currency: "ARS", modality: "evaluación", communicatedAt: "2026-10-15T10:00:00.000Z", status: "pending" }] });
    await expect(scheduleConsultationEvaluation({ consultationId: consultation.id, expectedVersion: "4", clientAppointmentId: "c42288cb-eef5-4461-a92a-c595591213c4", scheduledDate: "2026-10-20" }, dependencies(consultation))).rejects.toThrow("presupuesto vigente de evaluación");
  });

  it("recupera un guardado confirmado tras perder la respuesta, y rechaza reutilizar la operación con otros datos", async () => {
    let savedConsultation = base({ status: "coordinating", quotes: [{ id: "q-eval", scope: "initial-evaluation", revision: 1, amount: 0, currency: "ARS", modality: "evaluación inicial", communicatedAt: "2026-10-15T10:00:00.000Z", status: "accepted" }] });
    let savedAppointment: import("@/domain/consultation/consultation-appointment").EvaluationAppointment | null = null;
    const services = dependencies(savedConsultation);
    services.consultations.getById = vi.fn(async () => savedConsultation);
    services.consultations.getEvaluationAppointment = vi.fn(async () => savedAppointment);
    services.consultations.saveWithEvaluationAppointments = vi.fn(async ({ consultation, appointments }) => {
      savedConsultation = { ...consultation, version: "5" };
      savedAppointment = { ...appointments[0]!, version: "1" };
      return savedConsultation;
    });
    const request = { consultationId: savedConsultation.id, expectedVersion: "4", clientAppointmentId: "c42288cb-eef5-4461-a92a-c595591213c4", scheduledDate: "2026-10-20", startsAt: "2026-10-20T10:00:00-03:00", durationMinutes: 60 };
    const created = await scheduleConsultationEvaluation(request, services);
    const retried = await scheduleConsultationEvaluation(request, services);
    expect(retried.appointment.id).toBe(created.appointment.id);
    expect(services.consultations.saveWithEvaluationAppointments).toHaveBeenCalledOnce();
    await expect(scheduleConsultationEvaluation({ ...request, scheduledDate: "2026-10-21", startsAt: "2026-10-21T10:00:00-03:00" }, services)).rejects.toThrow("datos diferentes");
  });

  it("registra consentimiento y evaluación narrativa y completa cita/consulta atómicamente sin tratamiento", async () => {
    const appointment = { id: "evaluation-appointment-1", consultationId: "consultation-1", patientId: "patient-1", status: "confirmed" as const, scheduledDate: "2026-10-20", startsAt: "2026-10-20T10:00:00-03:00", endsAt: "2026-10-20T11:00:00-03:00", durationMinutes: 60, createdAt: "2026-10-15T12:00:00.000Z", version: "2" };
    const consultation = base({ status: "coordinating", appointmentIds: [appointment.id], contacts: [
      { id: "patient-contact", name: "Paciente Ficticio", relationship: "Paciente", roles: ["patient", "data-subject"] },
    ], quotes: [{ id: "q-eval", scope: "initial-evaluation", revision: 1, amount: 0, currency: "ARS", modality: "evaluación inicial", communicatedAt: "2026-10-15T10:00:00.000Z", status: "accepted" }] });
    const services = dependencies(consultation);
    services.clock = { now: () => new Date("2026-10-21T12:00:00.000Z") };
    services.consultations.getEvaluationAppointment = vi.fn(async () => appointment);
    const result = await recordInitialEvaluation({
      operationId: "e908e78d-1894-4d9f-bfed-9b79c750fc76", consultationId: consultation.id, appointmentId: appointment.id,
      expectedVersion: "4", expectedAppointmentVersion: "2", startedAt: "2026-10-20T10:05:00-03:00", endedAt: "2026-10-20T10:55:00-03:00",
      reason: "Evaluación funcional ficticia", subjective: "Refiere dificultad al caminar.", objective: "Marcha observada con asistencia.", assessment: "Requiere evaluación de equilibrio.",
      goalsAndPlan: "Completar plan luego de revisión.", consentContactId: "patient-contact", consentMethod: "verbal", consentAt: "2026-10-20T10:00:00-03:00", consentConfirmed: true,
    }, services);
    expect(result.consultation.status).toBe("evaluation-completed");
    expect(result.consultation.initialEvaluationId).toBe(result.evaluation.id);
    expect(result.consultation.noticesAndConsents.at(-1)).toMatchObject({ kind: "clinical-consent", actorContactId: "patient-contact", subjectContactId: "patient-contact" });
    expect(result.evaluation.patientId).toBe("patient-1");
    expect("treatmentId" in result.evaluation).toBe(false);
    expect(services.consultations.completeInitialEvaluation).toHaveBeenCalledOnce();
  });

  it("inicia tratamiento solo con evaluación, presupuesto y consentimiento vigentes", async () => {
    const consultation = base({
      status: "evaluation-completed", version: "6", initialEvaluationId: "initial-evaluation-1",
      contacts: [{ id: "patient-contact", name: "Paciente Ficticio", relationship: "Paciente", roles: ["patient", "data-subject", "budget-acceptor"] }],
      quotes: [
        { id: "q-eval", scope: "initial-evaluation", revision: 1, amount: 0, currency: "ARS", modality: "evaluación", communicatedAt: "2026-10-15T10:00:00Z", status: "accepted" },
        { id: "q-treatment", scope: "treatment", revision: 1, amount: 100, currency: "ARS", modality: "visita", communicatedAt: "2026-10-20T12:00:00Z", status: "accepted", acceptedByContactId: "patient-contact" },
      ],
    });
    const services = dependencies(consultation);
    services.clock = { now: () => new Date("2026-10-21T12:00:00.000Z") };
    services.consultations.getInitialEvaluation = vi.fn(async () => ({ id: "initial-evaluation-1", consultationId: consultation.id, appointmentId: "evaluation-appointment-1", patientId: "patient-1", startedAt: "2026-10-20T10:00:00Z", endedAt: "2026-10-20T11:00:00Z", reason: "Motivo", assessment: "Evaluación", clinicalEntries: { evaluations: [], symptoms: [], procedures: [] }, recordedAt: "2026-10-20T11:05:00Z" }));
    const started = await startTreatmentFromConsultation({
      consultationId: consultation.id, expectedVersion: "6", patientId: "patient-1", clientId: "03ff77bd-f9c2-42ce-8cf2-fcb60e3b7ff5",
      startDate: "2026-10-21", plannedSessionCount: 8, plannedFrequency: "2 por semana", diagnoses: [], precautions: [],
      consentContactId: "patient-contact", consentMethod: "verbal", consentAt: "2026-10-21T11:00:00.000Z", consentConfirmed: true,
    }, {
      ...services,
      patients: { getById: vi.fn(async () => ({ id: "patient-1", givenName: "Paciente", familyName: "Ficticio", version: "1", activeConsultationId: consultation.id })) },
      treatments: { getById: vi.fn(async () => null), listDirectory: vi.fn(async () => []), listByPatientId: vi.fn(async () => []) },
    });
    expect(started.treatment.status).toBe("active");
    expect(started.consultation.status).toBe("treatment-started");
    expect(started.consultation.treatmentId).toBe(started.treatment.id);
    expect(started.consultation.noticesAndConsents.at(-1)?.scope).toBe(`Tratamiento ${started.treatment.id}`);
    expect(services.consultations.startTreatmentFromConsultation).toHaveBeenCalledOnce();
  });
});


describe("evaluación retrospectiva", () => {
  const input = {
    operationId: "e908e78d-1894-4d9f-bfed-9b79c750fc76", consultationId: "consultation-1", expectedVersion: "4",
    startedAt: "2026-10-14T10:00:00Z", endedAt: "2026-10-14T10:50:00Z",
    reason: "Motivo inventado", assessment: "Evaluación inventada", consentContactId: "patient-contact",
    consentMethod: "verbal", consentAt: "2026-10-14T10:00:00Z", consentConfirmed: true,
  };
  function services() { return dependencies(base({ contacts: [{ id: "patient-contact", name: "Alias ficticio", relationship: "Paciente", roles: ["patient", "data-subject"] }] })); }
  it("guarda sin cita ni presupuesto, conserva seguimiento y recupera el mismo reintento", async () => {
    const deps = services();
    const result = await recordInitialEvaluation(input, deps);
    expect(result.consultation.followUps[0].status).toBe("pending");
    expect(result.consultation.quotes).toEqual([]);
    expect(result.evaluation.appointmentId).toBeUndefined();
    expect(result.consultation.treatmentId).toBeUndefined();
    expect(deps.consultations.completeInitialEvaluation).toHaveBeenCalledWith(expect.objectContaining({ appointment: undefined }));
    deps.consultations.getById = vi.fn(async () => result.consultation);
    deps.consultations.getInitialEvaluation = vi.fn(async () => result.evaluation);
    await expect(recordInitialEvaluation(input, deps)).resolves.toEqual(result);
    await expect(recordInitialEvaluation({ ...input, assessment: "Otro contenido" }, deps)).rejects.toThrow("contenido diferente");
    expect(deps.consultations.completeInitialEvaluation).toHaveBeenCalledOnce();
  });
  it.each([
    { endedAt: "2026-10-14T09:00:00Z" },
    { startedAt: "2026-10-16T10:00:00Z", endedAt: "2026-10-16T10:50:00Z" },
    { consentAt: "2026-10-14T10:01:00Z" },
    { consentConfirmed: false },
    { expectedVersion: "3" },
  ])("rechaza horarios, consentimiento o versión inválidos: %j", async override => {
    const deps = services();
    await expect(recordInitialEvaluation({ ...input, ...override }, deps)).rejects.toThrow();
    expect(deps.consultations.completeInitialEvaluation).not.toHaveBeenCalled();
  });
  it("exige resolver o vincular una cita abierta", async () => {
    const deps = services();
    deps.consultations.getById = vi.fn(async () => ({ ...base(), appointmentIds: ["appointment-1"] }));
    deps.consultations.getEvaluationAppointment = vi.fn(async () => ({ id: "appointment-1", consultationId: "consultation-1", patientId: "patient-1", status: "proposed" as const, scheduledDate: "2026-10-14", createdAt: "2026-10-13T10:00:00Z" }));
    await expect(recordInitialEvaluation(input, deps)).rejects.toThrow("Vinculá o resolvé");
  });
});
