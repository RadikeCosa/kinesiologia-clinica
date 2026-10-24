import { expect, test as base } from "@playwright/test";
import { randomUUID } from "node:crypto";

const endpoint = "http://localhost:8081/fhir";
const test = base.extend<{ visitIds: { today: string; overdue: string } }>({
  visitIds: async ({ request }, provide) => {
    const ids = { today: `fixture-ux-${randomUUID()}`, overdue: `fixture-ux-${randomUUID()}` };
    try {
      for (const [kind, id] of Object.entries(ids)) {
        const day = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }).format(new Date(Date.now() - (kind === "overdue" ? 86_400_000 : 0)));
        const response = await request.put(`${endpoint}/Appointment/${id}`, { data: {
          resourceType: "Appointment", id, status: "booked", start: `${day}T13:00:00Z`, end: `${day}T14:00:00Z`, minutesDuration: 60,
          participant: [{ actor: { reference: "Patient/demo-rosa" }, status: "accepted" }],
          supportingInformation: [{ reference: "EpisodeOfCare/demo-treatment-rosa" }],
        } });
        expect(response.ok()).toBe(true);
      }
      await provide(ids);
    } finally {
      for (const id of Object.values(ids)) {
        const response = await request.delete(`${endpoint}/Appointment/${id}`);
        expect(response.ok() || [404, 410].includes(response.status())).toBe(true);
      }
    }
  },
});

test("prioriza el día, pliega pendientes y muestra las precauciones sin interacción", async ({ page, visitIds }) => {
  await page.goto("/inicio");
  const pending = page.locator(".pending-visits");
  await expect(pending).not.toHaveAttribute("open", "");
  await expect(page.locator(`#appointment-${visitIds.overdue}`)).not.toBeVisible();
  const current = page.locator(`#appointment-${visitIds.today}`);
  await expect(current.getByRole("link", { name: "Rosa Benítez" })).toBeVisible();
  await expect(current.getByText("Evitar flexión forzada de rodilla")).toBeVisible();
  await page.locator(".pending-visits > summary").click();
  await expect(page.locator(`#appointment-${visitIds.overdue}`)).toBeVisible();
  await expect(page.locator(`#appointment-${visitIds.overdue}`).locator("..").locator(".pending-original-date")).toHaveText(/\d/);
  await page.getByRole("region", { name: /Consultas por atender/ }).getByRole("link", { name: "Ver todas", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Consultas abiertas" })).toBeVisible();
});

test("Más conserva el foco, prioriza la visita y solo se cierra con un clic exterior completo", async ({ page, visitIds }) => {
  await page.goto(`/inicio?resolver=${visitIds.overdue}`);
  const dialog = page.getByRole("dialog", { name: "Opciones de la visita" });
  const visit = dialog.getByRole("region", { name: "Visita", exact: true });
  const contact = dialog.getByRole("region", { name: "Contacto", exact: true });
  expect(await visit.evaluate((node, other) => Boolean(node.compareDocumentPosition(document.querySelector(other)!) & Node.DOCUMENT_POSITION_FOLLOWING), '#patient-contact-heading')).toBe(true);
  await expect(contact.getByRole("link", { name: "Llamar" })).toBeVisible();
  await dialog.getByRole("heading", { name: "Opciones de la visita" }).click();
  await expect(dialog).toBeVisible();
  const rect = await dialog.boundingBox();
  expect(rect).not.toBeNull();
  // A drag from the panel to its backdrop must not dismiss it.
  await page.mouse.move(rect!.x + 15, rect!.y + 15);
  await page.mouse.down();
  await page.mouse.move(5, 5);
  await page.mouse.up();
  await expect(dialog).toBeVisible();
  await page.mouse.click(5, 5);
  await expect(dialog).toHaveCount(0);
  await expect(page.locator(`#appointment-${visitIds.overdue}`)).toBeFocused();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page).not.toHaveURL(/resolver=/);
});

test("el fondo de un formulario no descarta lo escrito", async ({ page }) => {
  await page.goto("/inicio");
  await page.getByRole("button", { name: /Crear: Agendar/ }).click();
  await page.getByRole("button", { name: "Agendar visita", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Agendar visita" });
  await dialog.getByLabel("Horario opcional").fill("16:30");
  await page.mouse.click(5, 5);
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel("Horario opcional")).toHaveValue("16:30");
});

test("Hoy y Más se adaptan a pantallas pequeñas y conservan una referencia visual", async ({ page, visitIds }) => {
  await page.goto("/inicio");
  for (const width of [320, 356, 390, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    await expect(page.getByRole("heading", { level: 1, name: "Hoy" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    if (width === 390 || width === 1280) await page.screenshot({ path: `.local/ux-review/after-${width === 390 ? 'mobile' : 'desktop'}.png`, fullPage: true });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator(".pending-visits > summary").click();
  await page.locator(`#appointment-${visitIds.overdue}`).getByRole("button", { name: /Más opciones/ }).click();
  const options = page.getByRole("dialog", { name: "Opciones de la visita" });
  await expect(options.getByRole("link", { name: "Registrar visita" })).toBeInViewport();
  await page.screenshot({ path: '.local/ux-review/after-options-mobile.png' });
  await page.setViewportSize({ width: 844, height: 390 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.keyboard.press("Escape");
  await expect(options).toHaveCount(0);
});

test("los nombres largos y el texto ampliado conservan la lectura sin desbordar", async ({ page, request }) => {
  const key = randomUUID();
  const patientId = `fixture-ux-p-${key}`;
  const treatmentId = `fixture-ux-t-${key}`;
  const appointmentId = `fixture-ux-a-${key}`;
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }).format(new Date());
  const patientName = "Persona Completamente Ficticia Con Nombre Extenso Para Revisar Lectura";
  const resources = [
    { resourceType: "Patient", id: patientId, name: [{ given: [patientName], family: "Inventada" }] },
    { resourceType: "EpisodeOfCare", id: treatmentId, status: "active", patient: { reference: `Patient/${patientId}` }, period: { start: today } },
    { resourceType: "Appointment", id: appointmentId, status: "booked", start: `${today}T13:00:00Z`, end: `${today}T14:00:00Z`, participant: [{ actor: { reference: `Patient/${patientId}` }, status: "accepted" }], supportingInformation: [{ reference: `EpisodeOfCare/${treatmentId}` }] },
  ];
  try {
    for (const resource of resources) expect((await request.put(`${endpoint}/${resource.resourceType}/${resource.id}`, { data: resource })).ok()).toBe(true);
    await page.setViewportSize({ width: 320, height: 720 });
    await page.goto("/inicio");
    const card = page.locator(`#appointment-${appointmentId}`);
    await expect(card.getByRole("link", { name: `${patientName} Inventada` })).toBeVisible();
    await expect(card.getByText("Precauciones", { exact: true })).toHaveCount(0);
    await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
    const overflow = await page.evaluate(() => [...document.querySelectorAll("body *")].flatMap(node => {
      const rect = node.getBoundingClientRect();
      if (!node.checkVisibility() || !rect.width || node.closest(".week-strip") || rect.right <= window.innerWidth + 1) return [];
      return [{ element: node.tagName, className: node.getAttribute("class"), right: Math.round(rect.right) }];
    }));
    expect(overflow.slice(0, 8)).toEqual([]);
    const layout = await page.evaluate(() => ({
      width: window.innerWidth,
      scroll: document.documentElement.scrollWidth,
      containers: [...document.querySelectorAll("body *")].filter(node => node.checkVisibility() && node.clientWidth > 0 && node.scrollWidth > node.clientWidth + 1 && !node.closest(".week-strip")).map(node => ({ tag: node.tagName, className: node.getAttribute("class"), width: node.clientWidth, scroll: node.scrollWidth })).slice(0, 8),
    }));
    expect(layout.scroll, JSON.stringify(layout)).toBeLessThanOrEqual(layout.width);
  } finally {
    for (const resource of resources.reverse()) {
      const response = await request.delete(`${endpoint}/${resource.resourceType}/${resource.id}`);
      expect(response.ok() || [404, 410].includes(response.status())).toBe(true);
    }
  }
});
