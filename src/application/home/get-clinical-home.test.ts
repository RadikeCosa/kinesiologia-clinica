import { expect, it, vi } from "vitest";
import { getClinicalHome } from "./get-clinical-home";
import { PeriodStateError } from "@/domain/treatment-period/treatment-period";
import type { PeriodRepository } from "../periods/period.repository";
it("blocks an unverifiable period without inventing its count or hiding other patients",async()=>{
 const patients=[{id:"p1",givenName:"Una",familyName:"Ficticia"},{id:"p2",givenName:"Otra",familyName:"Ficticia"}];
 const treatments=patients.map((p,i)=>({id:`t${i+1}`,patientId:p.id,status:"active" as const,startDate:"2026-09-01",plannedSessionCount:10}));
 const periods:PeriodRepository={firstId:vi.fn(),get:vi.fn(),list:vi.fn(),materialize:vi.fn(),transition:vi.fn(),current:async t=>{if(t.id==="t1")throw new PeriodStateError("Período no verificable");return {id:"cp2",treatmentId:t.id,patientId:t.patientId,ordinal:2,quota:5,frequency:"Semanal",phase:"open",available:true,clinicalRevision:0};}};
 const data=await getClinicalHome(new Date("2026-09-29T13:00:00Z"),{periods,patients:{getById:vi.fn(),listByIds:vi.fn(),listAll:async()=>patients},treatments:{getById:vi.fn(),listActive:async()=>treatments,listDirectory:async()=>treatments},visits:{getById:vi.fn(),put:vi.fn(),listByPatientId:async()=>[],listInProgress:async()=>[]},scheduledVisits:{getById:vi.fn(),putIfAbsent:vi.fn(),replace:vi.fn(),close:vi.fn(),listByPatientId:async()=>[],listOpen:async()=>[],listBetween:async()=>[],listChangedBetween:async()=>[]}});
 expect(data.patients.find(p=>p.id==="p1")?.treatment).toMatchObject({periodUnavailable:true,visitBlockedReason:"No se pudo verificar el período vigente."});
 expect(data.patients.find(p=>p.id==="p2")?.treatment).toMatchObject({periodUnavailable:false,completedSessions:0,totalSessions:5,periodPhase:"open",visitBlockedReason:undefined});
});

it("orders pending consultations, marks overdue and preserves those without follow-up", async () => {
 const data = await getClinicalHome(new Date("2026-10-23T12:00:00Z"), {
  patients: { getById: vi.fn(), listByIds: vi.fn(), listAll: async () => [{id:"p",givenName:"Alias",familyName:"Ficticio"}] },
  treatments: { getById: vi.fn(), listActive: async()=>[], listDirectory: async()=>[] },
  visits: { getById: vi.fn(), put: vi.fn(), listByPatientId: async()=>[], listInProgress: async()=>[] },
  scheduledVisits: {getById:vi.fn(),putIfAbsent:vi.fn(),replace:vi.fn(),close:vi.fn(),listByPatientId:async()=>[],listOpen:async()=>[],listBetween:async()=>[],listChangedBetween:async()=>[]},
  consultations: {listActive: async () => [
   {id:"without",patientId:"p",status:"evaluation-completed",contacts:[],noticesAndConsents:[],quotes:[],appointmentIds:[],createdAt:"2026-10-20T12:00:00Z",followUps:[]},
   {id:"pending",patientId:"p",status:"open",contacts:[],noticesAndConsents:[],quotes:[],appointmentIds:[],createdAt:"2026-10-20T12:00:00Z",followUps:[
    {id:"future",dueAt:"2026-10-24T12:00:00Z",status:"pending",history:[]},
    {id:"resolved",dueAt:"2026-10-20T12:00:00Z",status:"completed",history:[]},
    {id:"past",dueAt:"2026-10-22T12:00:00Z",status:"pending",history:[]},
   ]},
  ]},
 });
 expect(data.openConsultations?.map(c=>c.id)).toEqual(["pending","without"]);
 expect(data.openConsultations?.[0].followUps).toEqual([
  {id:"past",dueAt:"2026-10-22T12:00:00Z",overdue:true},
  {id:"future",dueAt:"2026-10-24T12:00:00Z",overdue:false},
 ]);
 expect(data.openConsultations?.[1].followUps).toEqual([]);
});
