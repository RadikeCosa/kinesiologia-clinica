import { expect, test } from "@playwright/test";

test("la pantalla de acceso prioriza el ingreso en mobile", async ({ page }) => {
  await page.setViewportSize({ width: 356, height: 640 });
  await page.goto("/");

  await expect(page.getByRole("heading", { level: 1, name: "Kinesiología domiciliaria" })).toBeVisible();
  await expect(page.getByText("Toda la gestión de tus visitas en una sola app.", { exact: true })).toBeVisible();
  const primary = page.getByRole("link", { name: "Ingresar", exact: true });
  await expect(primary).toBeInViewport();
  await expect(primary).toHaveCSS("min-height", "48px");
  await expect(page.getByRole("link", { name: "¿Problemas para ingresar?" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("la navegación principal y los diálogos funcionan en viewport móvil", async ({ page }) => {
  await page.goto("/inicio?vista=pacientes");
  await expect(page.getByRole("heading", { level: 1, name: "Pacientes" })).toBeVisible();
  await page.getByRole("button", { name: /Crear: Agendar/ }).click();
  await page.getByRole("button", { name: "Agendar visita" }).last().click();
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

  await page.getByRole("button", { name: /Crear: Agendar/ }).click();
  await page.getByRole("button", { name: "Agendar visita" }).last().click();
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

test("muestra precauciones y ficha desde Más sin duplicar contacto", async ({ page }) => {
  await page.goto("/inicio");
  const rosa = page.locator("article.visit-card").filter({ hasText: "Rosa Benítez" }).first();
  await rosa.getByRole("button", { name: /Más opciones/ }).click();
  const dialog = page.getByRole("dialog", { name: "Opciones de la visita" });
  await expect(dialog.getByText("Precauciones")).toBeVisible();
  await expect(dialog.getByRole("link", { name: "Ver ficha del paciente" })).toBeVisible();
  await expect(dialog.getByText("Teléfono")).toHaveCount(0);
  await expect(dialog.getByText("Dirección")).toHaveCount(0);
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

test("la agenda semanal y el directorio aprovechan el ancho móvil", async ({ page }) => {
  await page.setViewportSize({ width: 356, height: 640 });
  await page.goto("/inicio?vista=agenda");
  await expect(page.locator(".agenda-week-strip button")).toHaveCount(7);
  await expect(page.getByRole("button", { name: "Ver mes" })).toBeVisible();
  await page.getByRole("button", { name: "Ver mes" }).click();
  await expect(page.locator(".month-calendar button")).toHaveCount(new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate());
  await expect(page.getByRole("link", { name: "Mes anterior" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Mes siguiente" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  await page.getByRole("button", { name: "Pacientes", exact: true }).click();
  await expect(page.getByText("Directorio completo")).toHaveCount(0);
  const filters = page.locator(".directory-filters");
  await expect(filters.locator("button")).toHaveCount(5);
  await expect(filters).toHaveCSS("flex-wrap", "nowrap");
  const rosa = page.locator("article.directory-card").filter({ hasText: "Rosa Benítez" });
  await expect(rosa.getByRole("link", { name: "Rosa Benítez" })).toBeVisible();
  const mapLink = rosa.getByRole("link", { name: /Ver mapa/ });
  await expect(mapLink).toBeVisible();
  await expect(mapLink).toHaveAttribute("target", "_blank");
  await expect(mapLink).toHaveAttribute("rel", "noopener noreferrer");
  await expect(rosa.getByRole("link", { name: "Llamar" })).toBeVisible();
  await expect(rosa.getByRole("link", { name: "WhatsApp" })).toBeVisible();
  await expect(rosa).toContainText("299 555 0101");
  await expect(rosa.locator(".patient-location-fact").getByText("Indicaciones para llegar")).toBeVisible();
  const precautions = rosa.locator(".patient-precautions-disclosure");
  await expect(precautions).toBeVisible();
  await expect(precautions).not.toHaveAttribute("open", "");
  await precautions.getByText("Tiene precauciones").click();
  await expect(precautions).toHaveAttribute("open", "");
  await expect(precautions.locator("li").first()).toBeVisible();
  await expect(rosa.getByRole("button", { name: "Comenzar visita" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("la agenda mobile navega semanas y restaura el día con atrás", async ({ page }) => {
  await page.setViewportSize({ width: 356, height: 640 });
  await page.goto("/inicio?vista=agenda");
  const initialDate = await page.locator(".agenda-week-strip button[aria-pressed='true']").getAttribute("aria-label");
  await page.getByRole("button", { name: "Semana siguiente" }).click();
  await expect(page).toHaveURL(/semana=\d{4}-\d{2}-\d{2}/);
  await page.goBack();
  await expect(page.locator(".agenda-week-strip button[aria-pressed='true']")).toHaveAttribute("aria-label", initialDate!);
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
  await expect(page.getByRole("link", { name: "Registrar visita" })).toBeVisible();
});

test("una cita demorada se registra como visita realizada", async ({ page, request }) => {
  const fixtureResponse = await request.get("http://localhost:8081/fhir/Appointment/demo-appt-overdue", { headers: { Accept: "application/fhir+json" } });
  const fixture = await fixtureResponse.json();
  delete fixture.cancelationReason;
  fixture.status = "booked";
  await request.put("http://localhost:8081/fhir/Appointment/demo-appt-overdue", { data: fixture, headers: { Accept: "application/fhir+json", "Content-Type": "application/fhir+json" } });
  await page.goto("/inicio");
  const pending = page.locator("article.visit-card").filter({ hasText: "11:00" }).first();
  await pending.getByRole("button", { name: "Registrar visita" }).click();
  const options = page.getByRole("dialog", { name: "Opciones de la visita" });
  await expect(options.getByRole("button", { name: "Comenzar visita" })).toHaveCount(0);
  await options.getByRole("link", { name: "Registrar visita" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Registrar visita realizada" })).toBeVisible();
  await expect(page.getByLabel("Carga diferida")).toBeChecked();
});

test("la ficha móvil permite abrir una visita anterior pendiente", async ({ page }) => {
  await page.setViewportSize({ width: 356, height: 640 });
  await page.goto("/patients/demo-rosa");
  const pending = page.locator(".patient-pending-note");
  await expect(pending.getByRole("link", { name: "Registrar visita" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await pending.getByRole("link", { name: "Registrar visita" }).click();
  await expect(page.getByRole("dialog", { name: "Opciones de la visita" })).toBeVisible();
});

test("evaluaciones y síntomas se despliegan por separado en móvil", async ({ page }) => {
  await page.setViewportSize({ width: 356, height: 640 });
  await page.goto("/patients/demo-rosa/visits/new?modo=diferida");
  const modules = page.locator("details.clinical-module");
  const evaluations = modules.nth(0);
  const symptoms = modules.nth(1);

  await expect(evaluations.locator("summary")).toContainText("Evaluaciones");
  await expect(symptoms.locator("summary")).toContainText("Síntomas referidos");
  await expect(evaluations).not.toHaveAttribute("open", "");
  await expect(symptoms).not.toHaveAttribute("open", "");

  await symptoms.locator("summary").focus();
  await page.keyboard.press("Enter");
  await expect(symptoms).toHaveAttribute("open", "");
  await expect(page.getByRole("button", { name: "Dolor", exact: true })).toBeVisible();
  await evaluations.locator("summary").click();
  await expect(evaluations).toHaveAttribute("open", "");
  await expect(symptoms).toHaveAttribute("open", "");

  await symptoms.locator("summary").click();
  await expect(symptoms).not.toHaveAttribute("open", "");
  await expect(evaluations).toHaveAttribute("open", "");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("el registro breve conserva contexto y módulos ampliables en móvil", async ({ page }) => {
  await page.goto("/patients/demo-rosa/visits/new?modo=diferida");
  await expect(page.getByRole("heading", { name: "Registrar visita realizada" })).toBeVisible();
  await expect(page.getByText(/Precauciones:/)).toBeVisible();
  await expect(page.getByText(/Último plan:/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Finalizar visita" })).toBeInViewport();
  await expect(page.locator("details.clinical-module").filter({ hasText: "Procedimientos" })).not.toHaveAttribute("open", "");
  await page.getByRole("button", { name: "Registrar dolor (0–10)" }).click();
  await expect(page.getByText("Sin elegir")).toBeVisible();
  await expect(page.getByRole("button", { name: "Guardar evaluación" })).toBeDisabled();
  const painSlider = page.getByRole("slider", { name: "Elegir con la barra" });
  await painSlider.focus();
  await painSlider.press("Home");
  await expect(page.getByLabel("Dolor de 0 a 10")).toHaveValue("0");
  await page.getByLabel("Dolor de 0 a 10").fill("4");
  await expect(painSlider).toHaveValue("4");
  await painSlider.focus();
  await painSlider.press("ArrowRight");
  await expect(page.getByLabel("Dolor de 0 a 10")).toHaveValue("5");
  await page.getByLabel("Dolor de 0 a 10").fill("4.5");
  await expect(page.getByRole("button", { name: "Guardar evaluación" })).toBeDisabled();
  await page.getByLabel("Dolor de 0 a 10").fill("4");
  await page.getByText("Agregar contexto").click();
  await page.getByLabel("Región corporal").fill("Rodilla");
  await page.getByRole("button", { name: "Guardar evaluación" }).click();
  await expect(page.getByText("Evaluaciones · 1")).toBeVisible();
  await page.getByRole("button", { name: "Editar" }).click();
  await expect(page.getByLabel("Región corporal")).toHaveValue("Rodilla");
});

test("cambiar el dominio inicia otra evaluación sin arrastrar Dolor NRS", async ({ page }) => {
  await page.goto("/patients/demo-rosa/visits/new?modo=diferida");
  await page.getByRole("button", { name: "Registrar dolor (0–10)" }).click();
  await page.getByLabel("Dolor de 0 a 10").fill("4");
  await page.getByLabel("Área de evaluación").selectOption("joint-mobility");

  await expect(page.getByLabel("¿Qué evaluaste?")).toBeEmpty();
  await expect(page.getByLabel("Dolor de 0 a 10")).toHaveCount(0);
  await expect(page.getByLabel("¿Qué observaste?")).toBeVisible();
  await page.getByLabel("¿Qué evaluaste?").fill("Flexión de rodilla");
  await page.getByLabel("¿Qué observaste?").fill("Movilidad ficticia limitada");
  await page.getByRole("button", { name: "Guardar evaluación" }).click();

  await page.getByRole("button", { name: "Nueva evaluación" }).click();
  await expect(page.getByLabel("¿Qué evaluaste?")).toBeEmpty();
  await page.getByRole("button", { name: "Registrar dolor (0–10)" }).click();
  await page.getByLabel("Dolor de 0 a 10").fill("3");
  await page.getByRole("button", { name: "Guardar evaluación" }).click();
  await expect(page.locator(".evaluation-card")).toHaveCount(2);
});

test("el registro confirmado usa una cabecera clínica compacta en móvil", async ({ page }) => {
  await page.goto("/patients/demo-alicia/visits/demo-visit-alicia-1");
  await expect(page.getByRole("heading", { level: 1, name: "Alicia Figueroa" })).toBeVisible();
  const summary = page.locator(".visit-record-summary");
  await expect(summary).toContainText(/\d{2}:\d{2}–\d{2}:\d{2}/);
  await expect(summary).toContainText("En vivo");
  await expect(summary).not.toContainText("2026");
  const headings = page.locator(".visit-narrative-section > h3, .visit-narrative-section .visit-section-heading h3");
  await expect(headings).toHaveText(["Cómo estaba y cómo respondió", "Evaluaciones", "Qué se hizo", "Próximo paso"]);
});
