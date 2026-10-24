import { expect, test as base, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";

const endpoint = "http://localhost:8081/fhir";
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }).format(new Date());
const test = base.extend<{ routeIds: string[] }>({
  routeIds: async ({ request }, provide) => {
    const date = today();
    const listUrl = `${endpoint}/List/daily-route-${date}`;
    const originalResponse = await request.get(listUrl);
    const original = originalResponse.ok() ? await originalResponse.json() : null;
    const ids = Array.from({ length: 3 }, () => `fixture-route-${randomUUID()}`);
    try {
      for (const [index, id] of ids.entries()) {
        const response = await request.put(`${endpoint}/Appointment/${id}`, { data: {
          resourceType: "Appointment", id, status: index === 2 ? "proposed" : "booked",
          ...(index < 2 ? { start: `${date}T${index === 0 ? "03:00" : "04:00"}:00Z`, end: `${date}T${index === 0 ? "03:30" : "04:30"}:00Z`, minutesDuration: 30 } : {}),
          requestedPeriod: [{ start: `${date}T00:00:00-03:00`, end: `${date}T23:59:00-03:00` }],
          participant: [{ actor: { reference: "Patient/demo-rosa" }, status: "accepted" }],
          supportingInformation: [{ reference: "EpisodeOfCare/demo-treatment-rosa" }],
        } });
        expect(response.ok()).toBe(true);
      }
      await provide(ids);
    } finally {
      // Restore the fictional day's prior route, preserving List identity and using CAS.
      const latestResponse = await request.get(listUrl);
      if (latestResponse.ok()) {
        const latest = await latestResponse.json();
        const restored = { ...(original ?? latest), entry: original?.entry ?? [] };
        delete restored.meta;
        const response = await request.post(endpoint, { data: { resourceType: "Bundle", type: "transaction", entry: [{ resource: restored, request: { method: "PUT", url: `List/daily-route-${date}`, ifMatch: `W/"${latest.meta.versionId}"` } }] } });
        expect(response.ok()).toBe(true);
      }
      for (const id of ids) {
        const response = await request.delete(`${endpoint}/Appointment/${id}`);
        expect(response.ok() || [404, 410].includes(response.status())).toBe(true);
      }
    }
  },
});
const cards = (page: Page) => page.getByRole("region", { name: "Recorrido de hoy", exact: true }).getByRole("article");
async function markNext(page: Page, id: string) {
  await page.locator(`#appointment-${id}`).getByRole("button", { name: /Más opciones/ }).click();
  await page.getByRole("button", { name: "Marcar como próxima", exact: true }).click();
  await expect(page.getByRole("region", { name: "Recorrido de hoy", exact: true })).toHaveAttribute("aria-busy", "false");
}
async function saved(page: Page) { await expect(page.getByRole("status").filter({ hasText: "Recorrido guardado." })).toBeVisible(); }

test("marca una única próxima, conserva horarios y comparte el orden al recargar y en otro dispositivo", async ({ page, browser, request, routeIds }) => {
  await page.goto("/inicio");
  const before = await Promise.all(routeIds.map(async id => (await request.get(`${endpoint}/Appointment/${id}`)).json()));
  await markNext(page, routeIds[1]); await saved(page);
  await expect(cards(page).first()).toHaveAttribute("id", `appointment-${routeIds[1]}`);
  await expect(cards(page).getByText("Próxima", { exact: true })).toHaveCount(1);
  await page.reload();
  await expect(cards(page).first()).toHaveAttribute("id", `appointment-${routeIds[1]}`);
  const other = await browser.newContext({ storageState: await page.context().storageState(), viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  try {
    const phone = await other.newPage(); await phone.goto("/inicio");
    await expect(cards(phone).first()).toHaveAttribute("id", `appointment-${routeIds[1]}`);
    await markNext(phone, routeIds[2]); await saved(phone);
    await page.bringToFront();
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(cards(page).first()).toHaveAttribute("id", `appointment-${routeIds[2]}`);
  } finally { await other.close(); }
  const after = await Promise.all(routeIds.map(async id => (await request.get(`${endpoint}/Appointment/${id}`)).json()));
  expect(after).toEqual(before);
});

test("arrastra desde el control y permite ordenar con teclado y cancelar", async ({ page, routeIds }) => {
  await page.setViewportSize({ width: 1280, height: 1200 });
  await page.goto("/inicio");
  await markNext(page, routeIds[1]); await saved(page);
  const id = routeIds[0];
  const handle = page.locator(`#appointment-${id}`).getByRole("button", { name: /Mover visita/ });
  await handle.scrollIntoViewIfNeeded();
  const keyboardVersion = await page.getByRole("region", { name: "Recorrido de hoy", exact: true }).getAttribute("data-route-version");
  await expect(handle).toBeEnabled();
  await handle.focus(); await page.keyboard.press("Space");
  await expect(page.locator('.route-sortable.is-dragging:not([aria-hidden="true"])')).toHaveCount(1);
  await page.keyboard.press("ArrowUp"); await page.keyboard.press("Space");
  await expect(page.getByRole("region", { name: "Recorrido de hoy", exact: true })).not.toHaveAttribute("data-route-version", keyboardVersion!);
  await saved(page);
  await expect(cards(page).first()).toHaveAttribute("id", `appointment-${id}`);
  await expect(handle).toBeEnabled();
  await handle.focus(); await page.keyboard.press("Space");
  await expect(page.locator('.route-sortable.is-dragging:not([aria-hidden="true"])')).toHaveCount(1);
  await page.keyboard.press("ArrowDown"); await page.keyboard.press("Escape");
  await expect(page.getByText("Movimiento cancelado.", { exact: true })).toBeAttached();
  await expect(page.locator('.route-sortable.is-dragging:not([aria-hidden="true"])')).toHaveCount(0);
  await expect(cards(page).first()).toHaveAttribute("id", `appointment-${id}`);
  await expect(handle).toBeEnabled();
  const source = await handle.boundingBox(); const target = await page.locator(`#appointment-${routeIds[1]}`).boundingBox();
  expect(source && target).toBeTruthy();
  await page.mouse.move(source!.x + source!.width / 2, source!.y + source!.height / 2);
  await page.mouse.down();
  await page.mouse.move(source!.x + source!.width / 2 + 8, source!.y + source!.height / 2, { steps: 3 });
  await expect(page.locator('.route-sortable.is-dragging:not([aria-hidden="true"])')).toHaveCount(1);
  await page.mouse.move(target!.x + target!.width / 2, target!.y + target!.height * 0.75, { steps: 15 });
  await page.mouse.up(); await saved(page);
  await expect(cards(page).first()).toHaveAttribute("id", `appointment-${routeIds[1]}`);
});

test("ofrece WhatsApp sin mensaje y comenzar aunque el horario pasó; restablece por horario", async ({ page, routeIds }) => {
  await page.goto("/inicio");
  const visit = page.locator(`#appointment-${routeIds[0]}`);
  await expect(visit.getByRole("button", { name: "Comenzar visita", exact: true })).toBeVisible();
  await expect(visit.getByRole("link", { name: /Avisar por WhatsApp/ })).toHaveAttribute("href", "https://wa.me/5492995550101");
  await expect(visit.getByRole("link", { name: "Registrar visita", exact: true })).toHaveCount(0);
  await markNext(page, routeIds[2]); await saved(page);
  await page.getByRole("button", { name: "Restablecer por horario" }).click(); await saved(page);
  await expect(cards(page).first()).toHaveAttribute("id", `appointment-${routeIds[0]}`);
  await page.locator(`#appointment-${routeIds[0]}`).getByRole("button", { name: /Más opciones/ }).click();
  await expect(page.getByRole("dialog").getByRole("link", { name: "Registrar visita", exact: true })).toBeVisible();
});

test("restaura el orden ante un error de transporte y detecta cambios concurrentes", async ({ page, request, routeIds }) => {
  await page.goto("/inicio");
  await markNext(page, routeIds[0]); await saved(page);
  await page.route("**/inicio", async route => {
    if (route.request().method() === "POST" && route.request().headers()["next-action"]) await route.abort("failed"); else await route.continue();
  });
  await markNext(page, routeIds[1]);
  await expect(page.getByRole("alert").filter({ hasText: "No se pudo guardar" })).toBeVisible();
  await expect(cards(page).first()).toHaveAttribute("id", `appointment-${routeIds[0]}`);
  await page.unroute("**/inicio");
  const url = `${endpoint}/List/daily-route-${today()}`;
  const current = await (await request.get(url)).json();
  current.entry.reverse();
  expect((await request.put(url, { data: current })).ok()).toBe(true);
  await markNext(page, routeIds[1]);
  await expect(page.getByRole("alert").filter({ hasText: "cambió en otro dispositivo" })).toBeVisible();
  const expectedFirstId = current.entry[0].item.reference.replace("Appointment/", "");
  await expect(cards(page).first()).toHaveAttribute("id", `appointment-${expectedFirstId}`);
});

test("el control responde al arrastre táctil y el contenido permite desplazar la pantalla", async ({ browser, page, routeIds }) => {
  const context = await browser.newContext({ storageState: await page.context().storageState(), viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  try {
    const phone = await context.newPage(); await phone.goto("/inicio");
    await markNext(phone, routeIds[1]); await saved(phone);
    await phone.getByRole("heading", { name: "Recorrido de hoy", exact: true }).scrollIntoViewIfNeeded();
    const id = routeIds[0];
    const handle = phone.locator(`#appointment-${id}`).getByRole("button", { name: /Mover visita/ });
    const source = await handle.boundingBox(); const target = await phone.locator(`#appointment-${routeIds[1]}`).boundingBox();
    expect(source && target).toBeTruthy();
    const session = await context.newCDPSession(phone);
    const point = { x: source!.x + source!.width / 2, y: source!.y + source!.height / 2 };
    await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [point] });
    await session.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: point.x, y: point.y - 10 }] });
    await expect(phone.locator('.route-sortable.is-dragging:not([aria-hidden="true"])')).toHaveCount(1);
    await session.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: point.x, y: target!.y + target!.height * 0.25 }] });
    await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await expect(cards(phone).first()).toHaveAttribute("id", `appointment-${id}`);
    await saved(phone);
    await expect(handle).toBeEnabled();
    await expect(phone.locator('.route-sortable[aria-hidden="true"]')).toHaveCount(0);
    const version = await phone.getByRole("region", { name: "Recorrido de hoy", exact: true }).getAttribute("data-route-version");
    const text = await cards(phone).first().getByText("Evitar flexión forzada de rodilla").boundingBox();
    const startScroll = await phone.evaluate(() => window.scrollY);
    await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: text!.x + 25, y: text!.y + 10 }] });
    await session.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: text!.x + 25, y: text!.y - 90 }] });
    await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await expect.poll(() => phone.evaluate(() => window.scrollY)).toBeGreaterThan(startScroll);
    await expect(phone.getByRole("region", { name: "Recorrido de hoy", exact: true })).toHaveAttribute("data-route-version", version!);
    await phone.screenshot({ path: ".local/ux-review/route-mobile.png", fullPage: true });
  } finally { await context.close(); }
});

test("al comenzar sale del recorrido y al finalizar permanece fuera de los pendientes", async ({ page, request, routeIds }) => {
  let visitId: string | undefined;
  try {
    await page.goto("/inicio");
    await markNext(page, routeIds[0]); await saved(page);
    await page.locator(`#appointment-${routeIds[0]}`).getByRole("button", { name: "Comenzar visita", exact: true }).click();
    await expect(page).toHaveURL(/\/patients\/demo-rosa\/visits\/[^/]+\/edit$/);
    const editPath = new URL(page.url()).pathname;
    visitId = editPath.split("/").at(-2)!;
    await page.goto("/inicio");
    await expect(page.locator(".priority-section")).toContainText("Rosa Benítez");
    await expect(page.locator(".priority-section").getByRole("button", { name: /Mover visita/ })).toHaveCount(0);
    await expect(cards(page).locator(`#appointment-${routeIds[0]}`)).toHaveCount(0);
    await expect(cards(page).first()).toHaveAttribute("id", `appointment-${routeIds[1]}`);
    await page.goto(editPath);
    await page.getByLabel(/Estado y respuesta/).fill("Estado ficticio para probar el recorrido");
    await page.getByLabel("Intervención realizada").fill("Intervención ficticia de prueba");
    await page.getByRole("button", { name: "Finalizar visita", exact: true }).click();
    await expect(page.getByText("Estado ficticio para probar el recorrido", { exact: true })).toBeVisible();
    await page.goto("/inicio");
    await expect(page.locator(".priority-section")).toHaveCount(0);
    await expect(cards(page).locator(`#appointment-${routeIds[0]}`)).toHaveCount(0);
    await expect(cards(page).first()).toHaveAttribute("id", `appointment-${routeIds[1]}`);
  } finally {
    if (visitId) {
      const response = await request.delete(`${endpoint}/Encounter/${visitId}`);
      expect(response.ok() || [404, 410].includes(response.status())).toBe(true);
    }
  }
});
