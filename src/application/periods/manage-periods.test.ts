import { describe, expect, it, vi } from "vitest";
import { changePeriod, type PeriodDependencies } from "./manage-periods";
import type { TreatmentPeriod } from "@/domain/treatment-period/treatment-period";
import type { Visit } from "@/domain/visit/visit";
import { canonical, hash } from "@/infrastructure/reports/report-tools";
const patient={id:"fake",givenName:"Persona",familyName:"Ficticia",version:"1"};
const treatment={id:"t1",patientId:"fake",currentPeriodId:"p1",status:"active" as const,startDate:"2026-09-01",version:"1"};
function ports(period: TreatmentPeriod, visits: Visit[]=[]): PeriodDependencies {
 return {patients:{getById:vi.fn(async()=>patient),listByIds:vi.fn(async()=>[patient])},treatments:{getById:vi.fn(async()=>treatment),listActive:vi.fn(async()=>[treatment]),listDirectory:vi.fn(async()=>[treatment])},visits:{getById:vi.fn(async()=>null),listByPatientId:vi.fn(async()=>visits),listInProgress:vi.fn(async()=>[]),put:vi.fn()},periods:{firstId:()=>"p1",get:vi.fn(async()=>period),current:vi.fn(async()=>period),list:vi.fn(async()=>[period]),materialize:vi.fn(async()=>period),transition:vi.fn()},reports:{get:vi.fn(async()=>null),byOperation:vi.fn(async()=>null),list:vi.fn(async()=>[]),pdf:vi.fn(),save:vi.fn()},metrics:{listByVisitId:vi.fn(async()=>[]),putIfAbsent:vi.fn()},evaluations:{listByPatientId:vi.fn(async()=>[]),listByVisitId:vi.fn(async()=>[]),putIfAbsent:vi.fn()},symptoms:{listByPatientId:vi.fn(async()=>[]),listByVisitId:vi.fn(async()=>[]),putIfAbsent:vi.fn()},procedures:{listByVisitId:vi.fn(async()=>[]),putIfAbsent:vi.fn()},conditions:{listByIds:vi.fn(async()=>[])},scheduledVisits:{getById:vi.fn(async()=>null),listByPatientId:vi.fn(async()=>[]),listOpen:vi.fn(async()=>[]),listBetween:vi.fn(async()=>[]),listChangedBetween:vi.fn(async()=>[]),putIfAbsent:vi.fn(),replace:vi.fn(),close:vi.fn()},reportTools:{canonical,hash,pdf:vi.fn(),operationId:vi.fn()},clock:{now:()=>new Date("2026-09-29T13:00:00Z")}};
}
const p:TreatmentPeriod={id:"p1",patientId:"fake",treatmentId:"t1",ordinal:1,quota:1,frequency:"Semanal",phase:"open",available:true,clinicalRevision:0,version:"1"};
const v:Visit={id:"v1",patientId:"fake",treatmentId:"t1",periodId:"p1",status:"finished",startedAt:"2026-09-01T13:00:00Z"};
describe("period transition preconditions with persistence doubles",()=>{
 it("never renews a full period without a saved current report",async()=>{
  const d=ports(p,[v]);await expect(changePeriod({patientId:patient.id,treatmentId:treatment.id,expectedVersion:"1",event:"renew",quota:10,frequency:"Semanal",operationId:"8b3c91ed-5f40-4277-a25c-a5979c2d084e"},d)).rejects.toThrow(/informe actualizado/);expect(d.periods.transition).not.toHaveBeenCalled();
 });
 it("cannot raise a full quota to bypass the report",async()=>{
  const d=ports(p,[v]);await expect(changePeriod({patientId:patient.id,treatmentId:treatment.id,expectedVersion:"1",event:"quota",quota:20},d)).rejects.toThrow(/cupo completo/);expect(d.periods.transition).not.toHaveBeenCalled();
 });
 it("finalizes zero sessions without asking persistence for a report",async()=>{
  const d=ports(p);await changePeriod({patientId:patient.id,treatmentId:treatment.id,expectedVersion:"1",event:"finish",endDate:"2026-09-29"},d);expect(d.reports.get).not.toHaveBeenCalled();expect(d.periods.transition).toHaveBeenCalledWith(expect.objectContaining({phase:"closed"}),expect.objectContaining({status:"finished"}),undefined,"1");
 });
});
