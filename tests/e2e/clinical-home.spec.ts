import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

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
    await expect(page.getByText("3 visitas por atender")).toBeVisible();
    await expect(page.locator(".week-strip button").first().locator("small")).toHaveText("3");
    await page.getByRole("button", { name: "Pacientes", exact: true }).click();
    await page.getByRole("button", { name: "Pausado" }).click();
    await expect(page.getByRole("heading", { name: "Mario Acosta" })).toBeVisible();
    await page.getByLabel("Buscar por nombre, teléfono o dirección").fill("Belgrano");
    await page.getByRole("button", { name: "Todos" }).click();
    await expect(page.getByRole("heading", { name: "Elena Suárez" })).toBeVisible();
    await page.getByRole("button", { name: "Agenda", exact: true }).click();
    await expect(page.locator(".month-calendar")).toBeVisible();
    const nextBlockDate = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }).format(new Date(Date.now() + 35 * 86_400_000));
    await page.getByRole("link", { name: "Mes siguiente" }).click();
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
    await expect(pending).toContainText("1 visita pendiente anterior");
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
    await page.goto("/inicio");
    const restored = page.locator("article.visit-card").filter({ hasText: "Carlos Méndez" }).first();
    await restored.getByRole("button", { name: /Más opciones/ }).click();
    await page.getByRole("link", { name: "Registrar visita" }).click();
    await expect(page.getByRole("heading", { name: "Registrar visita realizada" })).toBeVisible();
  });

  test("conecta las evaluaciones de una visita con su evolución longitudinal", async ({ page }) => {
    await page.goto("/patients/demo-rosa/visits/demo-visit-rosa-2");
    const evaluations = page.getByText("Evaluaciones · 2");
    await expect(evaluations).toBeVisible();
    await evaluations.click();
    await expect(page.getByRole("heading", { name: "Evaluaciones" })).toBeVisible();
    const pain = page.locator("article.visit-evaluation-card").filter({ hasText: "Dolor NRS" });
    await expect(pain).toContainText("4");
    await pain.getByRole("link", { name: "Ver evolución de Dolor NRS" }).click();
    await expect(page).toHaveURL(/\/patients\/demo-rosa#evaluation-series-/);
    await expect(page.getByRole("heading", { name: "Evolución de evaluaciones" })).toBeVisible();
    const series = page.locator(".evaluation-series-list article").filter({ hasText: "Dolor NRS" });
    await expect(series.locator("li")).toHaveCount(2);
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
    const overdue = page.locator("article").filter({ hasText: "11:00" }).first();
    await overdue.getByRole("button", { name: "Registrar visita" }).click();
    await page.getByRole("button", { name: "No se realizó" }).click();
    await page.getByLabel("Motivo").selectOption("patient-not-at-home");
    await page.getByRole("button", { name: "Confirmar" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    const changes = page.locator("details.history-group").filter({ hasText: "Cambios registrados hoy" });
    await changes.locator("summary").click();
    await expect(changes.locator(".history-row").filter({ hasText: "Rosa Benítez" }).filter({ hasText: "No se realizó" }).first()).toBeVisible();
  });

  test("comienza, continúa y finaliza una visita enlazada", async ({ page, request }) => {
    // Este caso necesita una cita futura para que el resultado no dependa de la
    // hora en que se ejecute la suite. Se restablece el recurso ficticio antes
    // de comenzar y conserva el mismo ID para probar la idempotencia.
    const start = new Date(Date.now() + 30 * 60_000);
    const end = new Date(start.getTime() + 60 * 60_000);
    const appointment = {
      resourceType: "Appointment",
      id: "demo-appt-today",
      status: "booked",
      start: start.toISOString(),
      end: end.toISOString(),
      minutesDuration: 60,
      participant: [{ actor: { reference: "Patient/demo-alicia" }, status: "accepted" }],
      supportingInformation: [{ reference: "EpisodeOfCare/demo-treatment-alicia" }],
      serviceType: [{ text: "Kinesiología domiciliaria" }],
    };
    const reset = await request.put("http://localhost:8081/fhir/Appointment/demo-appt-today", {
      headers: { "content-type": "application/fhir+json", accept: "application/fhir+json" },
      data: appointment,
    });
    expect(reset.ok()).toBeTruthy();

    await page.goto("/inicio");
    const scheduled = page.locator("article").filter({ hasText: "Alicia Figueroa" }).first();
    const begin = scheduled.getByRole("button", { name: /Comenzar (visita|ahora)/ });
    if (await begin.count()) {
      await begin.click();
    } else {
      await scheduled.getByRole("button", { name: "Registrar visita" }).click();
      await page.getByRole("dialog", { name: "Opciones de la visita" }).getByRole("button", { name: "Comenzar visita" }).click();
    }
    await expect(page).toHaveURL(/\/patients\/demo-alicia\/visits\/[^/]+\/edit$/);
    const visitPath = new URL(page.url()).pathname.replace(/\/edit$/, "");
    await expect(page.getByRole("heading", { level: 1, name: "Alicia Figueroa" })).toBeVisible();
    await page.getByLabel(/Estado y respuesta/).fill("Estado y respuesta ficticios para Playwright");
    await page.getByLabel("Intervención realizada").fill("Intervención ficticia para Playwright");
    await page.getByRole("button", { name: "Registrar dolor (0–10)" }).click();
    await expect(page.getByLabel("Dolor de 0 a 10")).toBeEmpty();
    await page.getByLabel("Dolor de 0 a 10").fill("2");
    await page.getByRole("button", { name: "Guardar evaluación" }).click();
    await page.getByText(/^Procedimientos/).click();
    await page.getByText("Ejercicio terapéutico").click();
    await page.getByRole("button", { name: "Finalizar visita" }).click();
    await expect(page.getByText("Estado y respuesta ficticios para Playwright")).toBeVisible();
    const evaluationSummary = page.getByText(/Evaluaciones · \d+/).first();
    if (await evaluationSummary.count()) await evaluationSummary.click();
    await expect(page.getByRole("heading", { name: "Dolor NRS" })).toBeVisible();
    await page.getByText("Horarios y registro").click();
    await expect(page.getByText("Registrada en el momento")).toBeVisible();
    await page.getByRole("link", { name: "Corregir visita" }).click();
    await expect(page.getByRole("heading", { name: "Alicia Figueroa" })).toBeVisible();
    await page.getByLabel(/Estado y respuesta/).fill("Estado ficticio corregido para Playwright");
    await page.getByRole("button", { name: "Editar" }).click();
    await page.getByLabel("Dolor de 0 a 10").fill("3");
    await page.getByRole("button", { name: "Guardar evaluación" }).click();
    await page.getByLabel(/Motivo de la corrección/).fill("Se corrigió la evaluación ficticia.");
    await page.getByRole("button", { name: "Guardar corrección" }).click();
    await expect(page.getByText("Estado ficticio corregido para Playwright")).toBeVisible();
    await expect(page.locator(".visit-evaluation-card.is-pain")).toContainText("3");
    await page.locator(".visit-annul-panel summary").click();
    await page.getByLabel("Motivo de la anulación").fill("La visita ficticia se registró por error.");
    await page.getByRole("button", { name: "Confirmar anulación" }).click();
    await expect(page).toHaveURL(/\/patients\/demo-alicia\?annulled=1$/);
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
