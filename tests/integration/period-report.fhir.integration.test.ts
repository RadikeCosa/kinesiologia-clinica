import { finishVisit } from "@/application/visits/manage-visit-workflow";
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import type { FhirClient } from "@/infrastructure/fhir/core/fhir.client";
import { createFhirClient } from "@/infrastructure/fhir/core/fhir.client";
import { createFhirPatientRepository } from "@/infrastructure/fhir/patient/fhir-patient.repository";
import { createFhirTreatmentRepository } from "@/infrastructure/fhir/episode-of-care/fhir-treatment.repository";
import { createFhirVisitRepository } from "@/infrastructure/fhir/encounter/fhir-visit.repository";
import { createFhirPeriodRepository } from "@/infrastructure/fhir/periods/fhir-period.repository";
import { createFhirReportRepository } from "@/infrastructure/fhir/periods/fhir-report.repository";
import { createFhirClinicalAdministrationRepository } from "@/infrastructure/fhir/administration/fhir-clinical-administration.repository";
import { createFhirClinicalWorkflowRepository } from "@/infrastructure/fhir/encounter/fhir-clinical-workflow.repository";
import { createFhirMetricRepository } from "@/infrastructure/fhir/observation/fhir-metric.repository";
import { createFhirClinicalEvaluationRepository } from "@/infrastructure/fhir/observation/fhir-clinical-evaluation.repository";
import { createFhirClinicalSymptomRepository } from "@/infrastructure/fhir/observation/fhir-clinical-symptom.repository";
import { createFhirPerformedProcedureRepository } from "@/infrastructure/fhir/procedure/fhir-performed-procedure.repository";
import { createFhirConditionRepository } from "@/infrastructure/fhir/condition/fhir-condition.repository";
import { createFhirScheduledVisitRepository } from "@/infrastructure/fhir/appointment/fhir-scheduled-visit.repository";
import { reportTools } from "@/infrastructure/reports/report-tools";
import { periodSnapshot, savePeriodReport, changePeriod } from "@/application/periods/manage-periods";
import type { Treatment } from "@/domain/treatment/treatment";
import type { Visit } from "@/domain/visit/visit";
const endpoint="http://localhost:8081/fhir";
if(process.env.FHIR_INTEGRATION_BASE_URL && process.env.FHIR_INTEGRATION_BASE_URL !== endpoint) throw new Error("Only fictional HAPI 8081 allowed.");
const suite=process.env.FHIR_INTEGRATION_BASE_URL ? describe : describe.skip;
suite("periods and immutable reports in HAPI", () => {
 const client=createFhirClient({baseUrl:endpoint});
 const d={ patients:createFhirPatientRepository(client), treatments:createFhirTreatmentRepository(client), visits:createFhirVisitRepository(client), periods:createFhirPeriodRepository(client), reports:createFhirReportRepository(client), administration:createFhirClinicalAdministrationRepository(client), workflow:createFhirClinicalWorkflowRepository(client), metrics:createFhirMetricRepository(client), evaluations:createFhirClinicalEvaluationRepository(client), symptoms:createFhirClinicalSymptomRepository(client), procedures:createFhirPerformedProcedureRepository(client), conditions:createFhirConditionRepository(client), scheduledVisits:createFhirScheduledVisitRepository(client), reportTools };
 const tracked=new Set<string>();
 async function setup(quota=1) {
   const patientId=`fixture-${randomUUID()}`, treatmentId=`fixture-${randomUUID()}`;
   tracked.add(`Patient/${patientId}`); tracked.add(`EpisodeOfCare/${treatmentId}`); tracked.add(`CarePlan/${d.periods.firstId(treatmentId)}`);
   await d.administration.putPatient({id:patientId,givenName:"Persona",familyName:"Ficticia"});
   const treatment: Treatment={id:treatmentId,patientId,status:"active",startDate:"2026-09-01",plannedSessionCount:quota,plannedFrequency:"Semanal"};
   await d.administration.startTreatment(treatment,[]);
   return (await d.treatments.getById(treatmentId))!;
 }
 async function visit(t:Treatment,status:Visit["status"]="finished") { const v:Visit={id:`fixture-${randomUUID()}`,patientId:t.patientId,treatmentId:t.id,status,startedAt:"2026-09-20T13:00:00Z",endedAt:status==="finished"?"2026-09-20T14:00:00Z":undefined,clinicalNote:{statusAndResponse:"Evolución ficticia: toleró la actividad.",intervention:"Ejercicio ficticio."}}; tracked.add(`Encounter/${v.id}`); return v; }
 async function archive(t:Treatment) { const s=await periodSnapshot(t.patientId,t.id,undefined,d); const op=randomUUID(); tracked.add(`Binary/rs-${op}`); tracked.add(`Binary/rp-${op}`); const input={operationId:op,patientId:t.patientId,treatmentId:t.id,sourceFingerprint:s.sourceFingerprint,narrative:s.content.narrative,professionalName:"Profesional ficticio",registration:""}; const r=await savePeriodReport(input,d); tracked.add(`DocumentReference/${r.id}`); return {r,input}; }
 afterAll(async()=>{ await client.transaction({resourceType:"Bundle",type:"transaction",entry:[...tracked].map(url=>({request:{method:"DELETE",url}}))}); });
 it("serializes two attempts at the last slot; saves atomically and retries without duplicates", async()=>{
   const t=await setup(), a=await visit(t),b=await visit(t);
   const result=await Promise.allSettled([d.workflow.completeRetrospective(a,[],[],[]),d.workflow.completeRetrospective(b,[],[],[])]);
   expect(result.filter(r=>r.status==="fulfilled")).toHaveLength(1);
   const s=await periodSnapshot(t.patientId,t.id,undefined,d); expect(s.count.completed).toBe(1); expect(s.period.phase).toBe("report-pending");
   await expect(d.workflow.completeRetrospective(await visit(t),[],[],[])).rejects.toThrow();
   const {r,input}=await archive(t); expect((await d.reports.get(r.id))?.content.completed).toBe(1); expect((await savePeriodReport(input,d)).id).toBe(r.id); expect(await d.reports.list(t.patientId)).toHaveLength(1); expect(Buffer.from(await d.reports.pdf(r.id)).subarray(0,4).toString()).toBe("%PDF");
   const latest=(await d.treatments.getById(t.id))!,p=await d.periods.current(latest),op=randomUUID();tracked.add(`CarePlan/tp-${op}`);
   const renew={patientId:t.patientId,treatmentId:t.id,periodId:p.id,expectedVersion:p.version,event:"renew",quota:10,frequency:"Dos veces por semana",operationId:op};
   await changePeriod(renew,d); await changePeriod(renew,d);
   const now=await periodSnapshot(t.patientId,t.id,undefined,d); expect(now.period.ordinal).toBe(2); expect(now.count.completed).toBe(0); expect(now.period.quota).toBe(10);
   expect((await d.visits.listByPatientId(t.patientId)).find(v=>v.status==="finished")?.periodId).toBe(p.id);
 },30000);
 it("requires a replacement after correction and detects corrupted PDF bytes",async()=>{
   const t=await setup();const v=await visit(t);await d.workflow.completeRetrospective(v,[],[],[]);const {r}=await archive(t);
   const saved=(await d.visits.getById(v.id))!;await d.workflow.correct({...saved,clinicalNote:{...saved.clinicalNote,statusAndResponse:"Dato ficticio corregido"}},[],[],[]);
   const s=await periodSnapshot(t.patientId,t.id,undefined,d);expect(s.sourceFingerprint).not.toBe(r.sourceFingerprint);
   await expect(changePeriod({patientId:t.patientId,treatmentId:t.id,expectedVersion:s.period.version,event:"renew",quota:10,frequency:"Semanal",operationId:randomUUID()},d)).rejects.toThrow(/actualizado/);
   const op=randomUUID();tracked.add(`Binary/rs-${op}`);tracked.add(`Binary/rp-${op}`);
   const replacement=await savePeriodReport({operationId:op,patientId:t.patientId,treatmentId:t.id,sourceFingerprint:s.sourceFingerprint,narrative:s.content.narrative,professionalName:"Profesional ficticio",registration:"",replaces:r.id,replacementReason:"Corregir datos fuente ficticios"},d);tracked.add(`DocumentReference/${replacement.id}`);
   expect((await d.reports.get(r.id))?.status).toBe("superseded");
   const binary=await client.get<Record<string,unknown>>(`Binary/rp-${op}`);await client.put(`Binary/rp-${op}`,{...binary,data:Buffer.from("alteración ficticia").toString("base64")});await expect(d.reports.pdf(replacement.id)).rejects.toThrow(/integridad/);
 },30000);
 it("reserves visit ten and reconciles simultaneous equal or different finishes", async()=>{
  const t=await setup(10);for(let i=0;i<9;i++) await d.workflow.completeRetrospective(await visit(t),[],[],[]);
  const active=await visit(t,"in-progress");await d.workflow.start(active);const started=(await d.visits.getById(active.id))!;
  const s=await periodSnapshot(t.patientId,t.id,undefined,d);expect(s.count).toEqual({completed:9,reserved:1});await expect(d.workflow.completeRetrospective(await visit(t),[],[],[])).rejects.toThrow();
  const input={visitId:active.id,expectedVersion:started.version,clinicalNote:active.clinicalNote,metrics:[]};
  const equal=await Promise.all([finishVisit(input,d),finishVisit(input,d)]);expect(equal[0].visit.id).toBe(equal[1].visit.id);expect((await finishVisit(input,d)).visit.id).toBe(active.id);
  const other=await setup(1),a=await visit(other,"in-progress");await d.workflow.start(a);const startedOther=(await d.visits.getById(a.id))!;
  const different=await Promise.allSettled([finishVisit({visitId:a.id,expectedVersion:startedOther.version,clinicalNote:a.clinicalNote,metrics:[]},d),finishVisit({visitId:a.id,expectedVersion:startedOther.version,clinicalNote:{...a.clinicalNote,statusAndResponse:"Otro contenido ficticio"},metrics:[]},d)]);expect(different.filter(r=>r.status==="fulfilled")).toHaveLength(1);
 },30000);
 it("converges concurrent legacy initialization, blocks missing quota and includes all over-quota legacy visits",async()=>{
  const t=await setup(10);await client.transaction({resourceType:"Bundle",type:"transaction",entry:[{request:{method:"DELETE",url:`CarePlan/${d.periods.firstId(t.id)}`}},{resource:{resourceType:"EpisodeOfCare",id:t.id,status:"active",patient:{reference:`Patient/${t.patientId}`},period:{start:"2026-09-01"}},request:{method:"PUT",url:`EpisodeOfCare/${t.id}`}}]});
  const legacy=(await d.treatments.getById(t.id))!;
  const initialized=await Promise.all([d.periods.materialize(legacy),d.periods.materialize(legacy)]);expect(initialized[0].id).toBe(initialized[1].id);
  await expect(d.workflow.start(await visit(legacy,"in-progress"))).rejects.toThrow(/Definir cupo/);
  for(let i=0;i<11;i++){const v=await visit(legacy);await d.visits.put(v);}
  const s=await periodSnapshot(t.patientId,t.id,undefined,d);expect(s.count.completed).toBe(11);
  await changePeriod({patientId:t.patientId,treatmentId:t.id,expectedVersion:s.period.version,event:"quota",quota:10,frequency:"Semanal"},d);
  const informed=await archive(t);expect(informed.r.content.completed).toBe(11);
  const p=await d.periods.current((await d.treatments.getById(t.id))!);const op=randomUUID();tracked.add(`CarePlan/tp-${op}`);await changePeriod({patientId:t.patientId,treatmentId:t.id,expectedVersion:p.version,event:"renew",quota:1,frequency:"Mensual",operationId:op},d);
  expect((await periodSnapshot(t.patientId,t.id,undefined,d)).count.completed).toBe(0);
  expect((await periodSnapshot(t.patientId,t.id,p.id,d)).count.completed).toBe(11);
 },30000);
 it("handles partial 6/10, cancellation, report, appointment blocking and finalization",async()=>{
  const t=await setup(10);for(let i=0;i<6;i++)await d.workflow.completeRetrospective(await visit(t),[],[],[]);
  let s=await periodSnapshot(t.patientId,t.id,undefined,d);
  await changePeriod({patientId:t.patientId,treatmentId:t.id,expectedVersion:s.period.version,event:"partial",reason:"Cierre anticipado ficticio"},d);
  s=await periodSnapshot(t.patientId,t.id,undefined,d);expect(s.period.closure).toBe("partial");
  await changePeriod({patientId:t.patientId,treatmentId:t.id,expectedVersion:s.period.version,event:"cancel-partial"},d);
  s=await periodSnapshot(t.patientId,t.id,undefined,d);expect(s.period.phase).toBe("open");
  await changePeriod({patientId:t.patientId,treatmentId:t.id,expectedVersion:s.period.version,event:"partial",reason:"Cierre anticipado ficticio"},d);const {r}=await archive(t);expect(r.content.partialReason).toBe("Cierre anticipado ficticio");
  s=await periodSnapshot(t.patientId,t.id,undefined,d);await expect(changePeriod({patientId:t.patientId,treatmentId:t.id,expectedVersion:s.period.version,event:"renew",quota:10,frequency:"Semanal",operationId:randomUUID()},d)).rejects.toThrow(/Solo puede/);
  const aid=`fixture-${randomUUID()}`;tracked.add(`Appointment/${aid}`);const appointment=await d.scheduledVisits.putIfAbsent({id:aid,patientId:t.patientId,treatmentId:t.id,status:"proposed",scheduledDate:"2026-09-29",createdAt:"2026-09-20T13:00:00Z"});
  await expect(changePeriod({patientId:t.patientId,treatmentId:t.id,expectedVersion:s.period.version,event:"finish",endDate:"2026-09-29"},d)).rejects.toThrow(/citas abiertas/);
  await d.scheduledVisits.close({...appointment,status:"cancelled"});
  await changePeriod({patientId:t.patientId,treatmentId:t.id,expectedVersion:s.period.version,event:"finish",endDate:"2026-09-29"},d);expect((await d.treatments.getById(t.id))?.status).toBe("finished");
 },30000);
 it("finishes an empty period without a report and rejects quota zero and active visits",async()=>{
  const t=await setup(1),s=await periodSnapshot(t.patientId,t.id,undefined,d);
  await expect(changePeriod({patientId:t.patientId,treatmentId:t.id,expectedVersion:s.period.version,event:"quota",quota:0},d)).rejects.toThrow();
  const v=await visit(t,"in-progress");await d.workflow.start(v);const active=await periodSnapshot(t.patientId,t.id,undefined,d);await expect(changePeriod({patientId:t.patientId,treatmentId:t.id,expectedVersion:active.period.version,event:"finish",endDate:"2026-09-29"},d)).rejects.toThrow(/en curso/);
  await d.workflow.annul({...((await d.visits.getById(v.id))!),status:"entered-in-error"});const empty=await periodSnapshot(t.patientId,t.id,undefined,d);await changePeriod({patientId:t.patientId,treatmentId:t.id,expectedVersion:empty.period.version,event:"finish",endDate:"2026-09-29"},d);expect(await d.reports.list(t.patientId)).toHaveLength(0);expect((await periodSnapshot(t.patientId,t.id,undefined,d)).period.phase).toBe("closed");
 },30000);
 it("keeps a renewed period independent of corrections and serializes closed-period replacements",async()=>{
  const t=await setup(1),v=await visit(t);await d.workflow.completeRetrospective(v,[],[],[]);const {r}=await archive(t);let s=await periodSnapshot(t.patientId,t.id,undefined,d);
  const renewOp=randomUUID();tracked.add(`CarePlan/tp-${renewOp}`);await changePeriod({patientId:t.patientId,treatmentId:t.id,expectedVersion:s.period.version,event:"renew",quota:10,frequency:"Semanal",operationId:renewOp},d);
  const before=await periodSnapshot(t.patientId,t.id,undefined,d);const old=(await d.visits.getById(v.id))!;await d.workflow.correct({...old,clinicalNote:{...old.clinicalNote,statusAndResponse:"Corrección posterior al cierre ficticia"}},[],[],[]);
  expect((await periodSnapshot(t.patientId,t.id,undefined,d)).sourceFingerprint).toBe(before.sourceFingerprint);
  s=await periodSnapshot(t.patientId,t.id,r.periodId,d);expect(s.period.phase).toBe("closed");
  const ops=[randomUUID(),randomUUID()];for(const op of ops){tracked.add(`Binary/rs-${op}`);tracked.add(`Binary/rp-${op}`);}
  const result=await Promise.allSettled(ops.map(operationId=>savePeriodReport({operationId,patientId:t.patientId,treatmentId:t.id,periodId:r.periodId,sourceFingerprint:s.sourceFingerprint,narrative:s.content.narrative,professionalName:"Profesional ficticio",registration:"",replaces:r.id,replacementReason:"Corrección posterior ficticia"},d)));
  const success=result.filter(x=>x.status==="fulfilled");expect(success).toHaveLength(1);for(const x of success)if(x.status==="fulfilled")tracked.add(`DocumentReference/${x.value.id}`);
  expect((await d.reports.list(t.patientId)).filter(x=>x.status==="current")).toHaveLength(1);expect((await d.periods.get(r.periodId))?.phase).toBe("closed");expect((await periodSnapshot(t.patientId,t.id,undefined,d)).period.id).toBe(before.period.id);
 },30000);

 it("recovers a committed report when its response was lost and rejects altered retries",async()=>{
  const t=await setup(1);await d.workflow.completeRetrospective(await visit(t),[],[],[]);const s=await periodSnapshot(t.patientId,t.id,undefined,d),op=randomUUID();tracked.add(`Binary/rs-${op}`);tracked.add(`Binary/rp-${op}`);
  const input={operationId:op,patientId:t.patientId,treatmentId:t.id,sourceFingerprint:s.sourceFingerprint,narrative:s.content.narrative,professionalName:"Profesional ficticio",registration:""};
  const lost={...d,reports:{...d.reports,save:async(...args:Parameters<typeof d.reports.save>)=>{await d.reports.save(...args);throw new Error("Respuesta perdida ficticia");}}};
  const r=await savePeriodReport(input,lost);tracked.add(`DocumentReference/${r.id}`);expect((await savePeriodReport(input,d)).id).toBe(r.id);await expect(savePeriodReport({...input,narrative:{...input.narrative,evolution:"Texto diferente"}},d)).rejects.toThrow(/datos diferentes/);expect(await d.reports.list(t.patientId)).toHaveLength(1);
  const json=await client.get<{data:string} & Record<string,unknown>>(`Binary/rs-${op}`);const data=JSON.parse(Buffer.from(json.data,"base64").toString());data.sourceVersions["Patient/fake"]="999";await client.put(`Binary/rs-${op}`,{...json,data:Buffer.from(JSON.stringify(data)).toString("base64")});await expect(d.reports.get(r.id)).rejects.toThrow(/integridad/);
 },30000);
 it("guards patient metadata while generating a report and leaves no files after a failed transaction",async()=>{
  const t=await setup(1);await d.workflow.completeRetrospective(await visit(t),[],[],[]);const s=await periodSnapshot(t.patientId,t.id,undefined,d),op=randomUUID();tracked.add(`Binary/rs-${op}`);tracked.add(`Binary/rp-${op}`);
  let ready!:()=>void,release!:()=>void;const prepared=new Promise<void>(resolve=>{ready=resolve;}),gate=new Promise<void>(resolve=>{release=resolve;});
  const saving=savePeriodReport({operationId:op,patientId:t.patientId,treatmentId:t.id,sourceFingerprint:s.sourceFingerprint,narrative:s.content.narrative,professionalName:"Profesional ficticio",registration:""},{...d,reportTools:{...reportTools,pdf:async content=>{ready();await gate;return reportTools.pdf(content);}}});
  await prepared;const patient=(await d.patients.getById(t.patientId))!;await d.administration.putPatient({...patient,givenName:"Nombre ficticio actualizado"},patient.version);release();await expect(saving).rejects.toThrow();expect(await d.reports.byOperation(op)).toBeNull();await expect(client.get(`Binary/rp-${op}`)).rejects.toThrow();expect((await periodSnapshot(t.patientId,t.id,undefined,d)).period.phase).toBe("report-pending");
 },30000);

 it("does not overwrite a concurrent metadata edit during legacy materialization", async () => {
  const t = await setup(10);
  const raw = await client.get<{ extension: { url: string }[] } & Record<string, unknown>>(`EpisodeOfCare/${t.id}`);
  await client.transaction({ resourceType: "Bundle", type: "transaction", entry: [
   { resource: { ...raw, extension: raw.extension.filter(e => !e.url.endsWith("episodeofcare-current-period-v1")) }, request: { method: "PUT", url: `EpisodeOfCare/${t.id}` } },
   { request: { method: "DELETE", url: `CarePlan/${d.periods.firstId(t.id)}` } },
  ] });
  const legacy = (await d.treatments.getById(t.id))!;
  let injected = false;
  const racingClient: FhirClient = { ...client, async transaction<T>(body: unknown): Promise<T> {
   const result = await client.transaction<T>(body);
   const bundle = body as { entry?: { resource?: { resourceType?: string; id?: string } }[] };
   if (!injected && bundle.entry?.some(e => e.resource?.resourceType === "CarePlan" && e.resource.id === d.periods.firstId(t.id))) {
    injected = true;
    const concurrent = (await d.treatments.getById(t.id))!;
    await d.administration.putTreatment({ ...concurrent, metadataRevision: (concurrent.metadataRevision ?? 0) + 1, clinicalContext: { therapeuticGoals: "Objetivo ficticio guardado en el otro dispositivo" } }, [], concurrent.version!);
   }
   return result;
  } };
  const administration = createFhirClinicalAdministrationRepository(racingClient);
  await expect(administration.putTreatment({ ...legacy, metadataRevision: (legacy.metadataRevision ?? 0) + 1, clinicalContext: { therapeuticGoals: "Edición ficticia basada en una versión antigua" } }, [], legacy.version!)).rejects.toThrow(/cambió/);
  expect((await d.treatments.getById(t.id))?.clinicalContext?.therapeuticGoals).toBe("Objetivo ficticio guardado en el otro dispositivo");
 }, 30000);

});
