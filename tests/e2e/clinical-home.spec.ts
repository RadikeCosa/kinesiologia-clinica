import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

const FHIR_ENDPOINT = "http://localhost:8081/fhir";

function e2eFhirIds() {
  return JSON.parse(readFileSync(".local/e2e-fhir-ids.json", "utf8")) as { overlap: string; reschedule: string };
}

async function setAppointmentId(page: import("@playwright/test").Page, value: string) {
  await page.locator('input[name="clientAppointmentId"]').evaluate((input, appointmentId) => {
    (input as HTMLInputElement).value = appointmentId;
  }, value);
}

test.describe.serial("pantalla inicial clínica", () => {
  test("protege la entrada cuando no hay sesión", async ({ browser }) => {
    const context = await browser.newContext();
    await context.clearCookies();
    const page = await context.newPage();
    await page.goto("/inicio");
    await expect(page).toHaveURL(/\/ingresar$/);
    await context.close();
  });

  test("navega, filtra y abre un día de la agenda mensual", async ({ page }) => {
    await page.goto("/inicio");
    await expect(page.getByRole("heading", { level: 1, name: "Hoy" })).toBeVisible();
    const actionSummary = page.locator("#day-heading");
    await expect(actionSummary).toHaveText(/^\d+ visitas? por atender$/);
    const actionCount = (await actionSummary.innerText()).match(/^\d+/)?.[0];
    expect(actionCount).toBeTruthy();
    await expect(page.locator(".week-strip button[aria-pressed='true'] small")).toHaveText(actionCount!);
    await page.getByRole("button", { name: "Pacientes", exact: true }).click();
    await page.getByRole("button", { name: "Pausado" }).click();
    await expect(page.getByRole("heading", { name: "Mario Acosta" })).toBeVisible();
    await page.getByLabel("Buscar por nombre, teléfono o dirección").fill("Belgrano");
    await page.getByRole("button", { name: "Todos" }).click();
    await expect(page.getByRole("heading", { name: "Elena Suárez" })).toBeVisible();
    await page.getByRole("button", { name: "Agenda", exact: true }).click();
    await expect(page.locator(".month-calendar")).toBeVisible();
    const timeZone = "America/Argentina/Buenos_Aires";
    const nextBlockDate = new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date(Date.now() + 35 * 86_400_000));
    const currentMonth = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit" }).format(new Date());
    const monthIndex = (value: string) => {
      const [year, month] = value.split("-").map(Number);
      return year * 12 + month;
    };
    let expectedMonth = currentMonth;
    const monthsAhead = monthIndex(nextBlockDate.slice(0, 7)) - monthIndex(currentMonth);
    for (let month = 0; month < monthsAhead; month += 1) {
      const [year, monthNumber] = expectedMonth.split("-").map(Number);
      const next = new Date(Date.UTC(year, monthNumber, 1));
      expectedMonth = `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}`;
      await page.getByRole("link", { name: "Mes siguiente" }).click();
      await expect(page).toHaveURL(new RegExp(`mes=${expectedMonth}`));
    }
    await expect(page).toHaveURL(new RegExp(`mes=${nextBlockDate.slice(0, 7)}`));
    await page.locator(".month-calendar button").filter({ has: page.locator("span", { hasText: new RegExp(`^${Number(nextBlockDate.slice(-2))}$`) }) }).click();
    await expect(page.getByRole("heading", { name: "Rosa Benítez" }).first()).toBeVisible();
  });

  test("separa los pendientes de Hoy y muestra una ficha de paciente completa", async ({ page }) => {
    await page.goto("/inicio");
    await expect(page.getByRole("heading", { name: /Visitas pendientes de días anteriores/ })).toBeVisible();
    await page.locator(".week-strip button").nth(1).click();
    await expect(page.getByRole("heading", { name: /Visitas pendientes de días anteriores/ })).toHaveCount(0);

    await page.goto("/inicio?vista=pacientes");
    await page.getByRole("link", { name: "Rosa Benítez", exact: true }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Rosa Benítez" })).toBeVisible();
    await expect(page.getByText("Las Mutisias 245, Neuquén")).toBeVisible();
    await expect(page.getByText("2 de 10")).toBeVisible();
    await expect(page.getByText("Gonartrosis derecha")).toBeVisible();
    await expect(page.getByText(/Mejor control de apoyo/)).toBeVisible();
  });

  test("abre desde la ficha las opciones de una visita pendiente anterior", async ({ page }) => {
    await page.goto("/patients/demo-rosa");
    const pending = page.locator(".patient-pending-note");
    await expect(pending).toContainText(/visitas? pendientes? anteriores?/);
    await expect(pending).toContainText(/\d{2}\/\d{2}\/\d{4}/);
    await pending.getByRole("link", { name: "Registrar visita" }).click();
    await expect(page).toHaveURL(/\/inicio\?vista=hoy&resolver=demo-appt-overdue/);
    const options = page.getByRole("dialog", { name: "Opciones de la visita" });
    await expect(options).toContainText("Rosa Benítez");
    await expect(options.getByRole("link", { name: "Registrar visita" })).toBeVisible();
    await expect(options.getByRole("button", { name: "No se realizó" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(options).toHaveCount(0);
    await expect(page).not.toHaveURL(/resolver=/);
    await expect(page.locator("#appointment-demo-appt-overdue")).toBeFocused();
  });

  test("permite comenzar o registrar una cita sin horario", async ({ page }) => {
    await page.goto("/inicio");
    const untimed = page.locator("article.visit-card").filter({ hasText: "Carlos Méndez" }).first();
    await expect(untimed.getByRole("button", { name: "Comenzar visita" })).toBeVisible();
    await expect(untimed.getByRole("link", { name: "Registrar visita" })).toHaveCount(0);
    await untimed.getByRole("button", { name: "Comenzar visita" }).click();
    await expect(page.getByRole("dialog", { name: "Comenzar visita ahora" })).toContainText("no se calculará puntualidad");
    await page.getByRole("button", { name: "Confirmar y comenzar" }).click();
    await expect(page).toHaveURL(/\/patients\/demo-carlos\/visits\/[^/]+\/edit$/);
    await page.getByRole("button", { name: "Anular inicio accidental" }).click();
    await expect(page).toHaveURL(/\/inicio$/);
    await page.goto("/inicio");
    const restored = page.locator("article.visit-card").filter({ hasText: "Carlos Méndez" }).first();
    await restored.getByRole("button", { name: /Más opciones/ }).click();
    await page.getByRole("dialog").getByRole("link", { name: "Registrar visita" }).click();
    await expect(page.getByRole("heading", { name: "Registrar visita realizada" })).toBeVisible();
  });

  test("conecta las evaluaciones de una visita con su evolución longitudinal", async ({ page }) => {
    await page.goto("/patients/demo-rosa/visits/demo-visit-rosa-2");
    const evaluations = page.getByText("Evaluaciones · 1");
    await expect(evaluations).toBeVisible();
    await evaluations.click();
    await expect(page.getByRole("heading", { name: "Evaluaciones" })).toBeVisible();
    const knee = page.locator("article.visit-evaluation-card").filter({ hasText: "Flexión de rodilla" });
    await expect(knee).toContainText("102 grados");
    await knee.getByRole("link", { name: "Ver evolución de Flexión de rodilla" }).click();
    await expect(page).toHaveURL(/\/patients\/demo-rosa#evaluation-series-/);
    await expect(page.getByRole("heading", { name: "Evolución de evaluaciones" })).toBeVisible();
    const series = page.locator(".evaluation-series-list article").filter({ hasText: "Flexión de rodilla" });
    await expect(series.locator("li")).toHaveCount(2);
  });

  test("prepara un resumen familiar editable sin cambiar la nota de la visita", async ({ page }) => {
    await page.goto("/patients/demo-rosa/visits/demo-visit-rosa-2");
    const summary = page.locator("details.family-visit-summary");
    await summary.locator("summary").click();
    const editor = summary.getByRole("textbox", { name: "Resumen para compartir" });
    await expect(editor).toHaveValue(/Rosa/);
    await expect(editor).toHaveValue(/Durante la visita se trabajó:/);
    await expect(editor).toHaveValue(/Flexión de rodilla \(Rodilla derecha\): 102 grados/);

    const shareLink = summary.getByRole("link", { name: "Abrir WhatsApp con el texto" });
    const originalDraft = await editor.inputValue();
    const originalUrl = new URL((await shareLink.getAttribute("href"))!);
    expect(originalUrl.hostname).toBe("wa.me");
    expect(originalUrl.searchParams.get("text")).toBe(originalDraft);

    await editor.fill("Texto ficticio editado para la familia.");
    const editedUrl = new URL((await shareLink.getAttribute("href"))!);
    expect(editedUrl.searchParams.get("text")).toBe("Texto ficticio editado para la familia.");
    await expect(summary.getByText("Este borrador no se guarda en la ficha.")).toBeVisible();
    await page.reload();
    await page.locator("details.family-visit-summary summary").click();
    await expect(page.getByRole("textbox", { name: "Resumen para compartir" })).toHaveValue(originalDraft);
  });

  test("advierte un cruce y permite confirmarlo", async ({ page }) => {
    await page.goto("/inicio");
    await page.getByRole("button", { name: /Crear: Agendar/ }).click();
    await page.getByRole("button", { name: "Agendar visita" }).last().click();
    await page.getByLabel("Paciente").selectOption("demo-rosa");
    const tomorrow = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }).format(new Date(Date.now() + 86_400_000));
    await page.getByLabel("Fecha").fill(tomorrow);
    await page.getByLabel("Horario opcional").fill("10:45");
    await setAppointmentId(page, e2eFhirIds().overlap);
    await page.getByRole("button", { name: "Agendar visita" }).last().click();
    await expect(page.getByText(/El horario se superpone/)).toBeVisible();
    await page.getByLabel("Guardar aunque se superponga").check();
    await page.getByRole("button", { name: "Confirmar horario" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("advierte en la interfaz una evaluación confirmada que se superpone con una visita", async ({ page }) => {
    const appointmentId = `evaluation-appointment-${randomUUID()}`;
    const treatmentAppointmentId = randomUUID();
    const date = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }).format(new Date(Date.now() + 7 * 86_400_000));
    const start = `${date}T13:00:00.000Z`;
    const end = new Date(new Date(start).getTime() + 60 * 60_000).toISOString();
    const evaluation = {
      id: appointmentId, consultationId: `fixture-consultation-${randomUUID()}`, patientId: "demo-rosa", status: "confirmed",
      scheduledDate: date, startsAt: start, endsAt: end, durationMinutes: 60, createdAt: new Date().toISOString(),
    };
    const created = await page.request.put(`${FHIR_ENDPOINT}/Appointment/${appointmentId}`, {
      data: {
        resourceType: "Appointment", id: appointmentId, status: "booked", start, end, minutesDuration: 60,
        created: evaluation.createdAt, participant: [{ actor: { reference: "Patient/demo-rosa" }, status: "accepted" }],
        serviceType: [{ text: "Evaluación inicial ficticia" }],
        extension: [{ url: "https://kinesiologiaadomicilio.local/fhir/StructureDefinition/consultation-evaluation-appointment-data-v1", valueString: JSON.stringify(evaluation) }],
      }, headers: { Accept: "application/fhir+json", "Content-Type": "application/fhir+json" },
    });
    expect(created.ok(), await created.text()).toBeTruthy();
    try {
      await page.goto("/inicio");
      await page.getByRole("button", { name: /Crear: Agendar/ }).click();
      await page.getByRole("button", { name: "Agendar visita" }).last().click();
      await page.getByLabel("Paciente").selectOption("demo-rosa");
      await page.getByLabel("Fecha").fill(date);
      await page.getByLabel("Horario opcional").fill("10:30");
      await setAppointmentId(page, treatmentAppointmentId);
      await page.getByRole("button", { name: "Agendar visita" }).last().click();
      await expect(page.getByText(/El horario se superpone/)).toBeVisible();
      await expect(page.getByLabel("Guardar aunque se superponga")).toBeVisible();
      await page.getByLabel("Guardar aunque se superponga").check();
      await page.getByRole("button", { name: "Confirmar horario" }).click();
      await expect(page.getByRole("dialog")).toHaveCount(0);
    } finally {
      await page.request.delete(`${FHIR_ENDPOINT}/Appointment/appointment-${treatmentAppointmentId}`);
      await page.request.delete(`${FHIR_ENDPOINT}/Appointment/${appointmentId}`);
    }
  });

  test("reprograma, cancela y marca una visita no realizada", async ({ page }) => {
    const tomorrow = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }).format(new Date(Date.now() + 86_400_000));
    await page.goto(`/inicio?vista=agenda&mes=${tomorrow.slice(0, 7)}&fecha=${tomorrow}`);
    const tomorrowCard = page.locator("article.agenda-card").filter({ hasText: "10:30" }).first();
    await tomorrowCard.getByRole("button", { name: /Más opciones/ }).click();
    await page.getByRole("button", { name: "Reprogramar" }).click();
    const afterTomorrow = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }).format(new Date(Date.now() + 2 * 86_400_000));
    await page.getByLabel("Fecha").fill(afterTomorrow);
    await page.getByLabel("Horario opcional").fill("11:00");
    await page.getByLabel("Motivo").selectOption("patient-not-at-home");
    await setAppointmentId(page, e2eFhirIds().reschedule);
    await page.getByRole("button", { name: "Guardar reprogramación" }).click();
    await expect(page.getByLabel("Guardar aunque se superponga")).toBeVisible();
    await page.getByLabel("Guardar aunque se superponga").check();
    await page.getByRole("button", { name: "Confirmar horario" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);

    const overlapping = page.locator("article.agenda-card").filter({ hasText: "10:45" }).first();
    await overlapping.getByRole("button", { name: /Más opciones/ }).click();
    await page.getByRole("button", { name: "Cancelar visita" }).click();
    await page.getByLabel("Motivo").selectOption("professional");
    await page.getByRole("button", { name: "Confirmar" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);

    await page.goto("/inicio");
    await page.locator(".pending-visits > summary").click();
    const overdue = page.locator("#appointment-demo-appt-overdue");
    await overdue.getByRole("button", { name: /Más opciones/ }).click();
    await page.getByRole("button", { name: "No se realizó" }).click();
    await page.getByLabel("Motivo").selectOption("patient-not-at-home");
    await page.getByRole("button", { name: "Confirmar" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    const changes = page.locator("details.history-group").filter({ hasText: "Cambios registrados hoy" });
    await changes.locator("summary").click();
    await expect(changes.locator(".history-row").filter({ hasText: "Rosa Benítez" }).filter({ hasText: "No se realizó" }).first()).toBeVisible();
  });

  test("comienza, continúa y finaliza una visita sin horario enlazada", async ({ page }) => {
    await page.goto("/inicio");
    const scheduled = page.locator("article").filter({ hasText: "Carlos Méndez" }).first();
    await expect(scheduled).toContainText("Sin horario");
    await scheduled.getByRole("button", { name: /Más opciones/ }).click();
    await page.getByRole("dialog", { name: "Opciones de la visita" }).getByRole("button", { name: "Comenzar visita" }).click();
    await page.getByRole("dialog", { name: "Comenzar visita ahora" }).getByRole("button", { name: "Confirmar y comenzar" }).click();
    await expect(page).toHaveURL(/\/patients\/demo-carlos\/visits\/[^/]+\/edit$/);
    const visitPath = new URL(page.url()).pathname.replace(/\/edit$/, "");
    await expect(page.getByRole("heading", { level: 1, name: "Carlos Méndez" })).toBeVisible();
    await page.getByLabel(/Estado y respuesta/).fill("Estado y respuesta ficticios para Playwright");
    await page.getByLabel("Intervención realizada").fill("Intervención ficticia para Playwright");
    await page.getByText("Síntomas referidos").click();
    await page.getByRole("button", { name: "Dolor", exact: true }).click();
    await expect(page.getByLabel("Intensidad de 0 a 10")).toBeEmpty();
    await page.getByLabel("Intensidad de 0 a 10").fill("2");
    await page.getByText(/^Procedimientos/).click();
    await page.getByText("Ejercicio terapéutico").click();
    await page.getByRole("button", { name: "Finalizar visita" }).click();
    await expect(page.getByText("Estado y respuesta ficticios para Playwright", { exact: true })).toBeVisible();
    const symptomSummary = page.getByText(/Síntomas referidos · \d+/).first();
    if (await symptomSummary.count()) await symptomSummary.click();
    await expect(page.getByRole("heading", { name: "Síntomas referidos por el paciente" })).toBeVisible();
    await page.getByText("Horarios y registro").click();
    await expect(page.getByText("Registrada en el momento")).toBeVisible();
    await page.getByRole("link", { name: "Corregir visita" }).click();
    await expect(page.getByRole("heading", { name: "Carlos Méndez" })).toBeVisible();
    await page.getByLabel(/Estado y respuesta/).fill("Estado ficticio corregido para Playwright");
    await page.getByText("Síntomas referidos").click();
    await page.getByLabel("Intensidad de 0 a 10").fill("3");
    await page.getByLabel(/Motivo de la corrección/).fill("Se corrigió la evaluación ficticia.");
    await page.getByRole("button", { name: "Guardar corrección" }).click();
    await expect(page.getByText("Estado ficticio corregido para Playwright", { exact: true })).toBeVisible();
    await page.getByText("Síntomas referidos · 1").click();
    await expect(page.locator(".symptom-record-card")).toContainText("3/10");
    await page.locator(".visit-annul-panel summary").click();
    await page.getByLabel("Motivo de la anulación").fill("La visita ficticia se registró por error.");
    await page.getByRole("button", { name: "Confirmar anulación" }).click();
    await expect(page).toHaveURL(/\/patients\/demo-carlos\?annulled=1$/);
    await page.locator(".annulled-visit-history summary").click();
    await expect(page.locator(`.annulled-visit-history a[href="${visitPath}"]`)).toBeVisible();
  });

  test("anula un inicio accidental y vuelve a Hoy", async ({ page }) => {
    await page.goto("/inicio?vista=pacientes");
    const rosa = page.locator("article").filter({ hasText: "Rosa Benítez" }).first();
    await rosa.getByRole("button", { name: "Comenzar visita" }).click();
    await expect(page).toHaveURL(/\/visits\/[^/]+\/edit$/);
    await page.getByRole("button", { name: "Anular inicio accidental" }).click();
    await expect(page).toHaveURL(/\/inicio$/);
  });
});
