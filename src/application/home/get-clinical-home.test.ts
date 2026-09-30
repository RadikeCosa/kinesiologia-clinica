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
