import { expect, test } from "@playwright/test";

test("la navegación principal y los diálogos funcionan en viewport móvil", async ({ page }) => {
  await page.goto("/inicio?vista=pacientes");
  await expect(page.getByRole("heading", { level: 1, name: "Pacientes" })).toBeVisible();
  await page.getByRole("button", { name: /Agendar/ }).first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await page.getByRole("button", { name: "Hoy", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Hoy" })).toBeVisible();
});

test("muestra una semana compacta y conserva el día al agendar", async ({ page }) => {
  await page.setViewportSize({ width: 400, height: 528 });
  await page.goto("/inicio");

  const days = page.locator(".week-strip button");
  await expect(days).toHaveCount(7);
  const firstVisit = page.locator("article.visit-card").first();
  await expect(firstVisit).toBeInViewport();

  const tomorrow = days.nth(1);
  const selectedDate = await tomorrow.getAttribute("aria-label");
  await tomorrow.click();
  await expect(page).toHaveURL(/fecha=\d{4}-\d{2}-\d{2}/);
  await expect(tomorrow).toHaveAttribute("aria-pressed", "true");

  await page.getByRole("button", { name: /Agendar/ }).first().click();
  await expect(page.getByLabel("Fecha")).not.toHaveValue("");
  await page.keyboard.press("Escape");
  expect(selectedDate).toBeTruthy();
});

test("agrupa las acciones secundarias y devuelve el foco al cerrar", async ({ page }) => {
  await page.goto("/inicio");
  const more = page.getByRole("button", { name: /Más opciones/ }).first();
  await more.click();
  await expect(page.getByRole("dialog", { name: "Opciones de la visita" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(more).toBeFocused();
});

test("agrupa contacto y ubicación dentro de cada visita de Hoy", async ({ page }) => {
  await page.goto("/inicio");
  const visit = page.locator("article.visit-card").filter({ hasText: "Carlos Méndez" }).first();
  await visit.getByRole("button", { name: /Teléfono/ }).click();
  await expect(page.getByRole("dialog", { name: "Contacto" }).getByRole("link", { name: "Llamar" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Enviar mensaje por WhatsApp" })).toBeVisible();
  await page.keyboard.press("Escape");
  await visit.getByRole("button", { name: /Dirección/ }).click();
  const location = page.getByRole("dialog", { name: "Cómo llegar" });
  await expect(location.getByText("Indicaciones para llegar")).toBeVisible();
  await expect(location.getByRole("link", { name: "Ver mapa" })).toBeVisible();
});

test("la agenda mensual y el directorio aprovechan el ancho móvil", async ({ page }) => {
  await page.setViewportSize({ width: 356, height: 640 });
  await page.goto("/inicio?vista=agenda");
  await expect(page.locator(".month-calendar button")).toHaveCount(new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate());
  await expect(page.getByRole("link", { name: "Mes anterior" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Mes siguiente" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  await page.getByRole("button", { name: "Pacientes", exact: true }).click();
  await expect(page.getByText("Directorio completo")).toHaveCount(0);
  const rosa = page.locator("article.directory-card").filter({ hasText: "Rosa Benítez" });
  await expect(rosa.getByRole("link", { name: "Rosa Benítez" })).toBeVisible();
  await expect(rosa.getByRole("link", { name: "Ver mapa" })).toBeVisible();
  await expect(rosa.getByRole("link", { name: "Llamar" })).toBeVisible();
  await expect(rosa.getByRole("link", { name: "WhatsApp" })).toBeVisible();
  await expect(rosa.locator(".patient-location-fact").getByText("Indicaciones para llegar")).toBeVisible();
  await expect(rosa.locator(".patient-precautions")).toBeVisible();
  await expect(rosa.getByRole("button", { name: "Comenzar visita" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("la agenda no ofrece agendar en el pasado y permite registrar en el día actual", async ({ page }) => {
  const format = (value: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }).format(value);
  const past = format(new Date(Date.now() - 2 * 86_400_000));
  await page.goto(`/inicio?vista=agenda&mes=${past.slice(0, 7)}&fecha=${past}`);
  await expect(page.getByRole("button", { name: "Agendar en este día" })).toHaveCount(0);

  const today = format(new Date());
  await page.goto(`/inicio?vista=agenda&mes=${today.slice(0, 7)}&fecha=${today}`);
  const active = page.locator("article.agenda-card").filter({ hasText: "Carlos Méndez" });
  await active.getByRole("button", { name: /Más opciones/ }).click();
  await expect(page.getByRole("link", { name: "Registrar visita ya realizada" })).toBeVisible();
});

test("una cita demorada puede comenzar ahora o registrarse después", async ({ page, request }) => {
  const fixtureResponse = await request.get("http://localhost:8081/fhir/Appointment/demo-appt-overdue", { headers: { Accept: "application/fhir+json" } });
  const fixture = await fixtureResponse.json();
  delete fixture.cancelationReason;
  fixture.status = "booked";
  await request.put("http://localhost:8081/fhir/Appointment/demo-appt-overdue", { data: fixture, headers: { Accept: "application/fhir+json", "Content-Type": "application/fhir+json" } });
  await page.goto("/inicio");
  const pending = page.locator("article.visit-card").filter({ hasText: "11:00" }).first();
  await pending.getByRole("button", { name: "Resolver visita" }).click();
  const options = page.getByRole("dialog", { name: "Opciones de la visita" });
  await expect(options.getByRole("button", { name: "Comenzar visita" })).toBeVisible();
  await options.getByRole("link", { name: "Registrar visita ya realizada" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Registrar visita realizada" })).toBeVisible();
  await expect(page.getByLabel("Carga diferida")).toBeChecked();
});

test("el registro breve conserva contexto y módulos ampliables en móvil", async ({ page }) => {
  await page.goto("/patients/demo-rosa/visits/new?modo=diferida");
  await expect(page.getByRole("heading", { name: "Registrar visita realizada" })).toBeVisible();
  await expect(page.getByText(/Precauciones:/)).toBeVisible();
  await expect(page.getByText(/Último plan:/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Finalizar visita" })).toBeInViewport();
  await expect(page.locator("details.clinical-module").filter({ hasText: "Procedimientos" })).not.toHaveAttribute("open", "");
  await page.getByRole("button", { name: "Registrar dolor (0–10)" }).click();
  await page.getByLabel("Valor").fill("4");
  await page.getByText("Agregar contexto").click();
  await page.getByLabel("Región corporal").fill("Rodilla");
  await page.getByRole("button", { name: "Guardar evaluación" }).click();
  await expect(page.getByText("Evaluaciones · 1")).toBeVisible();
  await page.getByRole("button", { name: "Editar" }).click();
  await expect(page.getByLabel("Región corporal")).toHaveValue("Rodilla");
});

test("el registro confirmado usa una cabecera clínica compacta en móvil", async ({ page }) => {
  await page.goto("/patients/demo-alicia/visits/demo-visit-alicia-1");
  await expect(page.getByRole("heading", { level: 1, name: "Alicia Figueroa" })).toBeVisible();
  const summary = page.locator(".visit-record-summary");
  await expect(summary).toContainText(/\d{2}:\d{2}–\d{2}:\d{2}/);
  await expect(summary).toContainText("En vivo");
  await expect(summary).not.toContainText("2026");
  const headings = page.locator(".visit-narrative-section > h3, .visit-narrative-section .visit-section-heading h3");
  await expect(headings).toHaveText(["Estado y respuesta", "Evaluaciones", "Intervención realizada", "Próximo paso", "Información del registro"]);
});
