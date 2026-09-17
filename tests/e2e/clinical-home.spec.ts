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
    await expect(page.getByRole("heading", { name: /Pendientes anteriores/ })).toBeVisible();
    await page.locator(".week-strip button").nth(1).click();
    await expect(page.getByRole("heading", { name: /Pendientes anteriores/ })).toHaveCount(0);

    await page.goto("/inicio?vista=pacientes");
    await page.getByRole("link", { name: "Rosa Benítez", exact: true }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Rosa Benítez" })).toBeVisible();
    await expect(page.getByText("Las Mutisias 245, Neuquén")).toBeVisible();
    await expect(page.getByText("2 de 10")).toBeVisible();
    await expect(page.getByText("Gonartrosis derecha")).toBeVisible();
    await expect(page.getByText(/Mejor control de apoyo/)).toBeVisible();
  });

  test("permite comenzar o registrar una cita sin horario", async ({ page }) => {
    await page.goto("/inicio");
    const untimed = page.locator("article.visit-card").filter({ hasText: "Carlos Méndez" }).first();
    await expect(untimed.getByRole("button", { name: "Comenzar visita" })).toBeVisible();
    await expect(untimed.getByRole("link", { name: "Registrar visita ya realizada" })).toHaveCount(0);
    await untimed.getByRole("button", { name: "Comenzar visita" }).click();
    await expect(page.getByRole("dialog", { name: "Comenzar visita ahora" })).toContainText("no se calculará puntualidad");
    await page.getByRole("button", { name: "Confirmar y comenzar" }).click();
    await expect(page).toHaveURL(/\/patients\/demo-carlos\/visits\/[^/]+\/edit$/);
    await page.getByRole("button", { name: "Anular inicio accidental" }).click();
    await page.goto("/inicio");
    const restored = page.locator("article.visit-card").filter({ hasText: "Carlos Méndez" }).first();
    await restored.getByRole("button", { name: /Más opciones/ }).click();
    await page.getByRole("link", { name: "Registrar visita ya realizada" }).click();
    await expect(page.getByRole("heading", { name: "Registrar visita realizada" })).toBeVisible();
  });

  test("conecta las evaluaciones de una visita con su evolución longitudinal", async ({ page }) => {
    await page.goto("/patients/demo-rosa/visits/demo-visit-rosa-2");
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
    await page.getByRole("button", { name: /Agendar/ }).first().click();
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
    await page.getByLabel("Motivo").selectOption("patient-or-family");
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
    await overdue.getByRole("button", { name: "Resolver visita" }).click();
    await page.getByRole("button", { name: "No se realizó" }).click();
    await page.getByLabel("Motivo").selectOption("patient-or-family");
    await page.getByRole("button", { name: "Confirmar" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    const changes = page.locator("details.history-group").filter({ hasText: "Actualizaciones de hoy" });
    await changes.locator("summary").click();
    await expect(changes.locator(".history-row").filter({ hasText: "Rosa Benítez" }).filter({ hasText: "No se realizó" })).toBeVisible();
  });

  test("comienza, continúa y finaliza una visita enlazada", async ({ page }) => {
    await page.goto("/inicio");
    const scheduled = page.locator("article").filter({ hasText: "Alicia Figueroa" }).first();
    await scheduled.getByRole("button", { name: /Comenzar (visita|ahora)/ }).click();
    await expect(page).toHaveURL(/\/patients\/demo-alicia\/visits\/[^/]+\/edit$/);
    await expect(page.getByRole("heading", { level: 1, name: "Alicia Figueroa" })).toBeVisible();
    await page.getByLabel(/Estado y respuesta/).fill("Estado y respuesta ficticios para Playwright");
    await page.getByLabel("Intervención realizada").fill("Intervención ficticia para Playwright");
    await page.getByRole("button", { name: "Registrar dolor (0–10)" }).click();
    await page.getByLabel("Valor").fill("2");
    await page.getByRole("button", { name: "Guardar evaluación" }).click();
    await page.getByText(/^Procedimientos/).click();
    await page.getByText("Ejercicio terapéutico").click();
    await page.getByRole("button", { name: "Finalizar visita" }).click();
    await expect(page.getByText("Estado y respuesta ficticios para Playwright")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Dolor NRS" })).toBeVisible();
    await expect(page.getByText("Registrada en el momento")).toBeVisible();
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
