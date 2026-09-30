import { describe, expect, it } from "vitest";
import { reportSource, draftContent, type SourceInput } from "./report-source";
import { canonical, hash } from "@/infrastructure/reports/report-tools";
const tools={canonical,hash};
const input: SourceInput={patient:{id:"fake",givenName:"Ángela",familyName:"Ficticia"},treatment:{id:"t1",patientId:"fake",status:"active",startDate:"2026-01-01"},period:{id:"p1",patientId:"fake",treatmentId:"t1",ordinal:1,quota:10,phase:"open",available:true,clinicalRevision:0},visits:[{id:"v1",patientId:"fake",treatmentId:"t1",status:"finished",startedAt:"2026-09-20T00:30:00Z",endedAt:"2026-09-20T01:30:00Z"}],diagnoses:[],evaluations:[{id:"o1",patientId:"fake",visitId:"v1",clientId:"fake",seriesId:"series",domain:"strength",name:"Fuerza",effectiveDateTime:"2026-09-20T01:30:00Z",result:{kind:"quantity",value:0,unit:"kg"}}],symptoms:[],metrics:[],procedures:[]};
describe("sourceFingerprintV1 and deterministic brief report",()=>{
 it("stays stable across key and entity order, UTC offsets and administrative changes",()=>{
   const second={...input,visits:[...input.visits,{...input.visits[0],id:"v2"}]};
   const reversed={...second,visits:[...second.visits].reverse().map(v=>({...v,startedAt:"2026-09-19T21:30:00-03:00"})),patient:{...input.patient,version:"9"},treatment:{...input.treatment,status:"paused" as const,metadataRevision:999,currentPeriodId:"p1"},period:{...input.period,available:false,clinicalRevision:9,currentReportId:"r1",phase:"reported" as const}};
   expect(reportSource(second,tools).sourceFingerprint).toBe(reportSource(reversed,tools).sourceFingerprint);
 });
 it("changes for identity, notes, results, context, membership, quota and partial reason",()=>{
  const base=reportSource(input,tools).sourceFingerprint;
  const variants:SourceInput[]=[{...input,patient:{...input.patient,givenName:"Otro"}},{...input,visits:input.visits.map(v=>({...v,clinicalNote:{intervention:"Cambio"}}))},{...input,evaluations:input.evaluations.map(e=>({...e,result:{kind:"quantity",value:1,unit:"kg"}}))},{...input,evaluations:input.evaluations.map(e=>({...e,context:{conditions:"Con asistencia"}}))},{...input,visits:input.visits.map(v=>({...v,periodId:"p2"}))},{...input,period:{...input.period,quota:11}},{...input,period:{...input.period,partialReason:"Cierre anticipado"}}];
  for(const v of variants) expect(reportSource(v,tools).sourceFingerprint).not.toBe(base);
 });
 it("deduplicates historical observations and retains a zero as one measurement",()=>{
   const withMetric={...input,metrics:[{id:"o1",patientId:"fake",visitId:"v1",code:"tug_seconds" as const,value:0,unit:"kg",effectiveDateTime:"2026-09-20T01:30:00Z"}]};
   expect(reportSource(withMetric,tools).sourceFingerprint).toBe(reportSource(input,tools).sourceFingerprint);
   const content=draftContent(withMetric);expect(content.measurements).toHaveLength(1);expect(content.measurements[0]).toMatch(/Única medición.*0 kg.*Sin dato para comparación/);expect(content.sessionDates[0]).toContain("19/9/26");
 });
 it("preserves absent reasons and does not compare different contexts",()=>{
   const absent={...input,evaluations:input.evaluations.map(e=>({...e,result:{kind:"absent" as const,reason:"not-tolerated" as const}}))};expect(draftContent(absent).measurements[0]).toContain("No tolerado");
   const two={...input,evaluations:[...input.evaluations,{...input.evaluations[0],id:"o2",effectiveDateTime:"2026-09-22T13:00:00Z",context:{conditions:"Con ayuda"}}]};expect(draftContent(two).measurements[0]).toContain("sin cálculo de diferencia");
 });
});
