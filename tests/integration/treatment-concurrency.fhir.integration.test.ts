import { createFhirConditionRepository } from "@/infrastructure/fhir/condition/fhir-condition.repository";
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { beginTreatment, changeTreatmentStatus } from "@/application/administration/manage-patient-treatment";
import { createFhirClient } from "@/infrastructure/fhir/core/fhir.client";
import { createFhirPatientRepository } from "@/infrastructure/fhir/patient/fhir-patient.repository";
import { createFhirTreatmentRepository } from "@/infrastructure/fhir/episode-of-care/fhir-treatment.repository";
import { createFhirClinicalAdministrationRepository } from "@/infrastructure/fhir/administration/fhir-clinical-administration.repository";
import { createFhirScheduledVisitRepository } from "@/infrastructure/fhir/appointment/fhir-scheduled-visit.repository";
import { firstPeriodId } from "@/infrastructure/fhir/periods/fhir-period.repository";
import { createFhirConsultationRepository } from "@/infrastructure/fhir/consultation/fhir-consultation.repository";
const baseUrl = "http://localhost:8081/fhir";
if (process.env.FHIR_INTEGRATION_BASE_URL && process.env.FHIR_INTEGRATION_BASE_URL !== baseUrl) throw new Error("Only fictional HAPI 8081 allowed.");
const suite = process.env.FHIR_INTEGRATION_BASE_URL ? describe : describe.skip;
const client = createFhirClient({ baseUrl }), resources = new Set<string>();
afterEach(async () => { if (resources.size) await client.transaction({ resourceType: "Bundle", type: "transaction", entry: [...resources].map(url => ({ request: { method: "DELETE", url } })) }); resources.clear(); });
function dependencies() { const c = createFhirClient({ baseUrl }); return { conditions: createFhirConditionRepository(c), patients: createFhirPatientRepository(c), treatments: createFhirTreatmentRepository(c), administration: createFhirClinicalAdministrationRepository(c), scheduledVisits: createFhirScheduledVisitRepository(c), clock: { now: () => new Date("2026-10-20T12:00:00Z") } }; }
async function setup() { const d = dependencies(), id = `fake-${randomUUID()}`; resources.add(`Patient/${id}`); await d.administration.putPatient({ id, givenName: "Persona", familyName: "Ficticia" }); return id; }
function input(patientId: string) { const clientId = randomUUID(), id = `treatment-${clientId}`; resources.add(`EpisodeOfCare/${id}`); resources.add(`CarePlan/${firstPeriodId(id)}`); return { clientId, patientId, startDate: "2026-10-01", plannedSessionCount: 10, plannedFrequency: "Semanal", diagnoses: [] }; }
suite("patient-coordinated treatment changes", () => {
 it("allows only one of two concurrent starts with different operation ids", async () => {
  const patientId = await setup(), a = input(patientId), b = input(patientId);
  const results = await Promise.allSettled([beginTreatment(a, dependencies()), beginTreatment(b, dependencies())]);
  expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
  expect((await dependencies().treatments.listByPatientId!(patientId)).filter(t => t.status === "active")).toHaveLength(1);
  const saved = results[0].status === "fulfilled" ? a : b;
  await expect(beginTreatment(saved, dependencies())).resolves.toMatchObject({ patientId });
  await expect(beginTreatment({ ...saved, plannedSessionCount: 20 }, dependencies())).rejects.toThrow("datos diferentes");
 });
 it("recognizes only an identical retry after a lost start response", async () => {
  const patientId = await setup(), d = dependencies(), request = input(patientId), conditionId = randomUUID();
  const command = { ...request, diagnoses: [{ clientId: conditionId, text: "Diagnóstico ficticio", kind: "medical_reference" as const }] };
  resources.add(`Condition/condition-${conditionId}`);
  const startTreatment = d.administration.startTreatment;
  const unreliable = { ...d, administration: { ...d.administration, startTreatment: async (...args: Parameters<typeof startTreatment>) => { await startTreatment(...args); throw new Error("Respuesta perdida ficticia"); } } };
  await expect(beginTreatment(command, unreliable)).resolves.toMatchObject({ patientId });
  await expect(beginTreatment({ ...command, diagnoses: [{ ...command.diagnoses[0], text: "Otro diagnóstico ficticio" }] }, d)).rejects.toThrow("datos diferentes");
  expect(await d.treatments.listByPatientId!(patientId)).toHaveLength(1);
 });
 it("allows only one of two paused treatments to reactivate", async () => {
  const patientId = await setup(), d = dependencies(), ids: string[] = [];
  for (let i = 0; i < 2; i++) { const t = await beginTreatment(input(patientId), d); const saved = (await d.treatments.getById(t.id))!; await changeTreatmentStatus(t.id, saved.version, "paused", undefined, undefined, d); ids.push(t.id); }
  const [a,b] = await Promise.all(ids.map(id => d.treatments.getById(id)));
  const results = await Promise.allSettled([changeTreatmentStatus(a!.id, a!.version, "active", undefined, undefined, dependencies()), changeTreatmentStatus(b!.id, b!.version, "active", undefined, undefined, dependencies())]);
  expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1); expect((await d.treatments.listByPatientId!(patientId)).filter(t => t.status === "active")).toHaveLength(1);
 });
 it("rejects a direct start whose patient snapshot predates a new consultation", async () => {
  const patientId = await setup(), d = dependencies(), snapshot = (await d.patients.getById(patientId))!, request = input(patientId);
  const id = `consultation-${randomUUID()}`; resources.add(`ServiceRequest/${id}`);
  await createFhirConsultationRepository(client).create({ patient: snapshot, consultation: { id, patientId, status: "open", contacts: [], noticesAndConsents: [], quotes: [], followUps: [], appointmentIds: [], createdAt: "2026-10-01T12:00:00Z" } });
  await expect(beginTreatment(request, { ...d, patients: { ...d.patients, getById: async () => snapshot } })).rejects.toThrow();
  expect(await d.treatments.getById(`treatment-${request.clientId}`)).toBeNull(); expect(await d.treatments.listByPatientId!(patientId)).toHaveLength(0);
 });
});
