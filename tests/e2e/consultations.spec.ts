import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";

const endpoint = "http://localhost:8081/fhir";
function localDateTime(daysFromNow: number) {
  const date = new Date(Date.now() + daysFromNow * 86_400_000);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}T${value("hour")}:${value("minute")}`;
}

test("registra una consulta, conserva la reprogramación y cierra cancelando el seguimiento pendiente", async ({ page }) => {
  test.setTimeout(60_000);
  const clientId = randomUUID();
  const patientId = `patient-${clientId}`;
  const consultationId = `consultation-${clientId}`;
  try {
    await page.goto(`/consultas/nueva?op=${clientId}`);
    await page.getByRole("textbox", { name: "Nombre y apellido", exact: true }).fill("Contacto Ficticio E2E");
    await page.getByRole("textbox", { name: "Relación con el paciente", exact: true }).fill("Hermana");
    await page.getByLabel("Nombre del paciente").fill("Paciente Ficticio");
    await page.getByLabel("Apellido del paciente").fill("E2E");
    await page.getByLabel("Quien se comunica es el paciente").uncheck();
    await page.getByLabel("Próximo contacto acordado").fill(localDateTime(2));
    await page.getByRole("checkbox", { name: /informé a quien se comunica/i }).check();
    await page.getByRole("checkbox", { name: /si el paciente es otra persona/i }).check();
    await page.getByRole("button", { name: "Registrar consulta" }).click();
    await page.waitForURL(new RegExp(`/consultas/${consultationId}$`));
    await expect(page.getByRole("heading", { name: "Consulta", exact: true })).toBeVisible();
    await expect(page.getByText("Estado:").getByText("Abierta")).toBeVisible();

    await page.getByLabel("Persona que autoriza").selectOption({ label: "Paciente Ficticio E2E · paciente" });
    await page.getByLabel("Nombre de la persona destinataria").fill("Familiar Autorizado E2E");
    await page.getByLabel("Relación con el paciente").fill("Hermana");
    await page.getByLabel("Información que puede comunicarse").fill("Coordinar horarios, sin compartir información clínica");
    await page.getByLabel("Confirmo que la persona identificada autorizó esta comunicación con el alcance indicado.").check();
    await page.getByRole("button", { name: "Guardar constancia" }).click();
    await expect(page.getByRole("heading", { name: "Familiar Autorizado E2E", exact: true })).toBeVisible();
    await expect(page.getByText("Coordinar horarios, sin compartir información clínica")).toBeVisible();
    await page.getByLabel("Quién revoca").selectOption({ label: "Paciente Ficticio E2E · paciente" });
    await page.getByLabel("Motivo o instrucción recibida").fill("El paciente pidió detener estas comunicaciones");
    await page.getByRole("button", { name: "Revocar autorización" }).click();
    await expect(page.getByText(/Revocada por Paciente Ficticio E2E/)).toBeVisible();

    const followUp = page.locator(".follow-up-item").first();
    await followUp.getByLabel("Fecha del próximo contacto").fill(localDateTime(4));
    await followUp.getByRole("button", { name: "Reprogramar" }).click();
    await expect(page.locator(".follow-up-item").first()).toContainText("Reprogramado desde");

    await page.getByLabel("Motivo de cierre").selectOption("withdrew");
    await page.getByRole("checkbox", { name: /Confirmo el cierre/ }).check();
    await page.getByRole("button", { name: "Cerrar consulta" }).click();
    await expect(page.getByText("Consulta cerrada · Desistió")).toBeVisible();
    await expect(page.locator(".follow-up-item").first()).toContainText("Cancelado");
    await expect(page.locator(".follow-up-item").first()).toContainText("Reprogramado desde");
    const savedPatient = await page.request.get(`${endpoint}/Patient/${patientId}`, { headers: { Accept: "application/fhir+json" } });
    expect(savedPatient.ok()).toBeTruthy();
    expect((await savedPatient.json()).extension?.some((item: { url?: string }) => item.url?.endsWith("patient-active-consultation-v1")) ?? false).toBe(false);
  } finally {
    for (const path of [`ServiceRequest/${consultationId}`, `Patient/${patientId}`]) {
      const response = await fetch(`${endpoint}/${path}`, { method: "DELETE", signal: AbortSignal.timeout(10_000) });
      expect(response.ok || response.status === 404 || response.status === 410).toBeTruthy();
    }
  }
});

test("retoma una consulta y guarda evaluación retrospectiva sin cita ni presupuesto", async ({ page, context }) => {
  test.setTimeout(90_000);
  const op = randomUUID();
  const consultationId = `consultation-${op}`;
  const patientId = `patient-${op}`;
  let evaluationId: string | undefined;
  try {
    await page.goto(`/consultas/nueva?op=${op}`);
    await page.getByLabel("Nombre del paciente").fill("Alias Ficticio Retro");
    await page.getByLabel("Nombre y apellido", { exact: true }).fill("Contacto Inventado");
    await page.getByLabel("Relación con el paciente", { exact: true }).fill("Familiar");
    await page.getByLabel("Quien se comunica es el paciente").uncheck();
    await page.getByLabel("Motivo inicial", { exact: true }).fill("Relato completamente inventado para probar el flujo");
    await page.getByLabel("Quién lo refiere").selectOption("family");
    await page.getByRole("checkbox", { name: /informé a quien se comunica/i }).check();
    await page.getByRole("checkbox", { name: /si el paciente es otra persona/i }).check();
    await page.getByLabel("Próximo contacto acordado").fill(localDateTime(1));
    await page.getByRole("button", { name: "Registrar consulta" }).click();
    await page.waitForURL(new RegExp(`/consultas/${consultationId}$`));
    await expect(page.getByText("Relato completamente inventado para probar el flujo")).toBeVisible();
    await page.goto(`/patients/${patientId}`);
    await page.getByRole("link", { name: "Ver consulta activa" }).click();
    await page.goto("/inicio");
    const consultations = page.getByRole("region", { name: "Consultas abiertas" });
    await consultations.getByRole("link", { name: "Alias Ficticio Retro" }).click();
    const date = localDateTime(-1).slice(0, 10);
    await page.getByLabel("Inicio real").fill(`${date}T10:00`);
    await page.getByLabel("Fin real").fill(`${date}T10:50`);
    await page.getByLabel("Motivo de consulta y objetivos").fill("Motivo inventado");
    await page.getByLabel("Evaluación profesional", { exact: true }).fill("Hallazgos inventados");
    await page.getByLabel("Quién otorgó consentimiento clínico").selectOption({ label: "Alias Ficticio Retro · paciente" });
    await page.getByLabel("Fecha y hora del consentimiento").fill(`${date}T09:59`);
    await page.getByLabel("Confirmo que el consentimiento clínico fue otorgado antes de realizar la evaluación.").check();
    await page.getByRole("button", { name: "Guardar evaluación", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Evaluación registrada", exact: true })).toBeVisible();
    await expect(page.getByText("Hallazgos inventados")).toBeVisible();
    const response = await page.request.get(`${endpoint}/ServiceRequest/${consultationId}`);
    const resource = await response.json();
    const saved = JSON.parse(resource.extension.find((e: { url: string }) => e.url.endsWith("service-request-consultation-data-v1")).valueString);
    evaluationId = saved.initialEvaluationId;
    expect(saved.appointmentIds).toEqual([]);
    expect(saved.quotes).toEqual([]);
    expect(saved.followUps[0].status).toBe("pending");
    const cookies = await context.cookies();
    await context.clearCookies();
    await page.goto(`/consultas/${consultationId}`);
    await expect(page).toHaveURL(/ingresar/);
    await context.addCookies(cookies);
    await page.goto(`/consultas/${consultationId}`);
    await expect(page.getByText("Hallazgos inventados")).toBeVisible();
    await page.screenshot({ path: "/tmp/fictional-initial-evaluation.png", fullPage: true });
  } finally {
    for (const path of [evaluationId ? `Encounter/${evaluationId}` : null, `ServiceRequest/${consultationId}`, `Patient/${patientId}`].filter(Boolean)) {
      const response = await fetch(`${endpoint}/${path}`, { method: "DELETE", signal: AbortSignal.timeout(10_000) });
      expect(response.ok || [404, 410].includes(response.status)).toBeTruthy();
    }
  }
});

test("agenda y reprograma una evaluación de 50 minutos", async ({ page }) => {
  const op = randomUUID();
  const consultationId = `consultation-${op}`;
  const patientId = `patient-${op}`;
  const appointments: string[] = [];
  try {
    await page.goto(`/consultas/nueva?op=${op}`);
    await page.getByLabel("Nombre del paciente").fill("Paciente Ficticio Duración");
    await page.getByLabel("Nombre y apellido", { exact: true }).fill("Paciente Ficticio Duración");
    await page.getByLabel("Relación con el paciente", { exact: true }).fill("Paciente");
    await page.getByLabel("Puede responder el presupuesto").check();
    await page.getByRole("checkbox", { name: /informé a quien se comunica/i }).check();
    await page.getByLabel("Próximo contacto acordado").fill(localDateTime(1));
    await page.getByRole("button", { name: "Registrar consulta" }).click();
    await page.waitForURL(new RegExp(`/consultas/${consultationId}$`));
    const quote = page.getByRole("heading", { name: "Comunicar un presupuesto" }).locator("..");
    await quote.getByLabel("Importe (0 si es gratuito)").fill("100");
    await quote.getByLabel("Modalidad", { exact: true }).fill("Por evaluación ficticia");
    await quote.getByLabel("Próximo contacto acordado").fill(localDateTime(1));
    await quote.getByRole("button", { name: "Guardar presupuesto comunicado" }).click();
    const response = page.getByRole("button", { name: "Aceptar", exact: true }).locator("xpath=ancestor::form");
    await response.getByLabel("Persona que responde").selectOption({ label: "Paciente Ficticio Duración" });
    await response.getByLabel("Próximo contacto acordado").fill(localDateTime(1));
    await response.getByRole("button", { name: "Aceptar", exact: true }).click();
    const schedule = page.getByRole("heading", { name: "Coordinar una evaluación" }).locator("..");
    await schedule.getByLabel("Fecha", { exact: true }).fill(localDateTime(40).slice(0, 10));
    await schedule.getByLabel("Hora (opcional)").fill("10:00");
    await schedule.getByLabel("Duración", { exact: true }).fill("50");
    await schedule.getByRole("button", { name: "Guardar cita de evaluación" }).click();
    await expect(page.getByRole("heading", { name: "Reprogramar", exact: true })).toBeVisible();
    const saved = await (await page.request.get(`${endpoint}/ServiceRequest/${consultationId}`)).json();
    const intake = JSON.parse(saved.extension.find((e: { url: string }) => e.url.endsWith("service-request-consultation-data-v1")).valueString);
    appointments.push(...intake.appointmentIds);
    const appointment = await (await page.request.get(`${endpoint}/Appointment/${appointments[0]}`)).json();
    expect(appointment.minutesDuration).toBe(50);
    const reschedule = page.getByRole("heading", { name: "Reprogramar", exact: true }).locator("..");
    await reschedule.getByLabel("Nueva fecha").fill(localDateTime(41).slice(0, 10));
    await reschedule.getByLabel("Hora (opcional)").fill("11:00");
    await reschedule.getByLabel("Duración", { exact: true }).fill("50");
    await reschedule.getByRole("button", { name: "Guardar nueva fecha" }).click();
    await expect(page.getByText("Estado: cancelled · reprogramada")).toBeVisible();
  } finally {
    const savedResponse = await page.request.get(`${endpoint}/ServiceRequest/${consultationId}`);
    if (savedResponse.ok()) {
      const saved = await savedResponse.json();
      const intake = JSON.parse(saved.extension.find((e: { url: string }) => e.url.endsWith("service-request-consultation-data-v1")).valueString);
      appointments.push(...intake.appointmentIds);
    }
    for (const path of [...new Set(appointments)].map(id => `Appointment/${id}`).concat([`ServiceRequest/${consultationId}`, `Patient/${patientId}`])) {
      const response = await fetch(`${endpoint}/${path}`, { method: "DELETE", signal: AbortSignal.timeout(10_000) });
      expect(response.ok || [404, 410].includes(response.status)).toBeTruthy();
    }
  }
});
