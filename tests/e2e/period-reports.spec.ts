import { createHash, randomBytes, randomUUID } from "node:crypto";
import Database from "better-sqlite3";
import { test, expect } from "@playwright/test";
const endpoint="http://localhost:8081/fhir";
const base="https://kinesiologiaadomicilio.local/fhir/StructureDefinition/";
const firstId=(id:string)=>`tp-${createHash("sha256").update(`treatment-period-v1:${id}:1`).digest("hex").slice(0,40)}`;
async function put(type:string,id:string,resource:Record<string,unknown>){const response=await fetch(`${endpoint}/${type}/${id}`,{method:"PUT",headers:{"Content-Type":"application/fhir+json"},body:JSON.stringify({...resource,resourceType:type,id})});expect(response.ok).toBeTruthy();}
async function fixture(){const patientId=`fixture-e2e-${randomUUID()}`,treatmentId=`fixture-e2e-${randomUUID()}`,visitId=`fixture-e2e-${randomUUID()}`;
 await put("Patient",patientId,{name:[{given:["Persona"],family:"Ficticia Informes"}]});await put("EpisodeOfCare",treatmentId,{status:"active",patient:{reference:`Patient/${patientId}`},period:{start:"2026-09-01"},extension:[{url:`${base}episodeofcare-planned-session-count-v1`,valuePositiveInt:1},{url:`${base}episodeofcare-planned-frequency-v1`,valueString:"Semanal"}]});
 await put("Encounter",visitId,{status:"finished",class:{system:"http://terminology.hl7.org/CodeSystem/v3-ActCode",code:"AMB"},subject:{reference:`Patient/${patientId}`},episodeOfCare:[{reference:`EpisodeOfCare/${treatmentId}`}],period:{start:"2026-09-20T13:00:00Z",end:"2026-09-20T14:00:00Z"},extension:[{url:`${base}encounter-clinical-status-and-response-v1`,valueString:"Estado ficticio inicial"},{url:`${base}encounter-clinical-intervention`,valueString:"Ejercicio ficticio"}]});
 return {patientId,treatmentId,visitId};}
async function cleanup(f:Awaited<ReturnType<typeof fixture>>){
 const docs=await fetch(`${endpoint}/DocumentReference?patient=${f.patientId}&_count=100`).then(r=>r.json());const careplans=await fetch(`${endpoint}/CarePlan?patient=${f.patientId}&_count=100`).then(r=>r.json());
 const paths=[`Encounter/${f.visitId}`,`EpisodeOfCare/${f.treatmentId}`,`Patient/${f.patientId}`,`CarePlan/${firstId(f.treatmentId)}`];
 for(const e of docs.entry??[]){paths.push(`DocumentReference/${e.resource.id}`);for(const c of e.resource.content??[])paths.push(c.attachment.url);}
 for(const e of careplans.entry??[])paths.push(`CarePlan/${e.resource.id}`);
 const response=await fetch(endpoint,{method:"POST",headers:{"Content-Type":"application/fhir+json"},body:JSON.stringify({resourceType:"Bundle",type:"transaction",entry:[...new Set(paths)].map(url=>({request:{method:"DELETE",url}}))})});expect(response.ok).toBeTruthy();
}
test("cupo completo, informe definitivo, descarga privada y renovación",async({page,browser})=>{
 const f=await fixture();try{
  await page.goto(`/patients/${f.patientId}`);await expect(page.getByText("Período 1 · Informe pendiente")).toBeVisible();
  await page.goto(`/patients/${f.patientId}/visits/new`);await expect(page.getByRole("heading",{name:"No se puede registrar otra visita"})).toBeVisible();await page.getByRole("link",{name:"Revisar período e informe"}).click();
  await page.getByRole("textbox",{name:"Evolución",exact:true}).fill("Evolución revisada ficticia para familia y médico.");await page.getByLabel("Nombre del profesional").fill("Profesional ficticio");await page.getByLabel("Revisé el informe y confirmo su guardado definitivo.").check();await page.getByRole("button",{name:"Guardar informe definitivo"}).click();
  await expect(page.getByRole("heading",{name:"Informe definitivo",exact:true})).toBeVisible();await page.getByRole("link",{name:"Ver informe",exact:true}).click();await expect(page.getByText("Evolución revisada ficticia para familia y médico.")).toBeVisible();await expect(page.getByRole("textbox")).toHaveCount(0);
  const url=await page.getByRole("link",{name:"Descargar PDF"}).getAttribute("href");const response=await page.request.get(url!);expect(response.status()).toBe(200);const bytes=await response.body();expect(bytes.subarray(0,4).toString()).toBe("%PDF");expect(await (await page.request.get(url!)).body()).toEqual(bytes);
  const anonymous=await browser.newContext({storageState:{cookies:[],origins:[]}});try{expect((await anonymous.request.get(`http://localhost:3100${url}`)).status()).toBe(401);}finally{await anonymous.close();}
  const db=new Database(".local/e2e-auth.sqlite"),token=randomBytes(32).toString("base64url"),sid=randomUUID(),now=Date.now();db.prepare("INSERT INTO sessions (id,token_hash,credential_id,label,created_at,last_seen_at,expires_at) VALUES (?,?,?,?,?,?,?)").run(sid,createHash("sha256").update(token).digest("hex"),"e2e-passkey","Revocación ficticia",now,now,now+3600000);
  const revocable=await browser.newContext({storageState:{cookies:[{name:"clinical_session",value:token,domain:"localhost",path:"/",expires:Math.floor((now+3600000)/1000),httpOnly:true,secure:false,sameSite:"Strict"}],origins:[]}});try{expect((await revocable.request.get(`http://localhost:3100${url}`)).status()).toBe(200);db.prepare("UPDATE sessions SET revoked_at=? WHERE id=?").run(now,sid);expect((await revocable.request.get(`http://localhost:3100${url}`)).status()).toBe(401);}finally{db.prepare("DELETE FROM sessions WHERE id=?").run(sid);db.close();await revocable.close();}
  await page.getByRole("link",{name:"Volver al período"}).click();await page.getByLabel("Sesiones del nuevo período").fill("10");await page.getByLabel("Frecuencia del nuevo período").fill("Dos veces por semana");await page.getByRole("button",{name:"Renovar período",exact:true}).click();await expect(page.getByText(/Período 2 · 0 de 10 sesiones · Abierto/)).toBeVisible();await expect(page.getByRole("heading",{name:"Historial de informes"})).toBeVisible();
 }finally{await cleanup(f);}
});
test("datos fuente cambiados bloquean guardar y permiten revisar sin perder el texto editado",async({page})=>{
 const f=await fixture();try{
 await page.goto(`/patients/${f.patientId}/periods`);await page.getByRole("textbox",{name:"Evolución",exact:true}).fill("Texto editado ficticio que debe conservarse.");await page.getByLabel("Nombre del profesional").fill("Profesional ficticio");await page.getByLabel("Revisé el informe y confirmo su guardado definitivo.").check();
 const resource=await fetch(`${endpoint}/Encounter/${f.visitId}`).then(r=>r.json());resource.extension.find((e:{url:string})=>e.url===`${base}encounter-clinical-status-and-response-v1`).valueString="Estado ficticio actualizado desde otro dispositivo";await put("Encounter",f.visitId,resource);
 await page.getByRole("button",{name:"Guardar informe definitivo"}).click();await expect(page.locator(".period-report-editor").getByRole("alert")).toContainText("Los registros clínicos cambiaron");await expect(page.getByRole("textbox",{name:"Evolución",exact:true})).toHaveValue("Texto editado ficticio que debe conservarse.");await page.getByRole("button",{name:"Actualizar datos estructurados y conservar mi texto"}).click();await page.getByLabel("Revisé el informe y confirmo su guardado definitivo.").check();await expect(page.getByRole("textbox",{name:"Evolución",exact:true})).toHaveValue("Texto editado ficticio que debe conservarse.");await page.getByRole("button",{name:"Guardar informe definitivo"}).click();await expect(page.getByRole("heading",{name:"Informe definitivo",exact:true})).toBeVisible();
 }finally{await cleanup(f);}
});
