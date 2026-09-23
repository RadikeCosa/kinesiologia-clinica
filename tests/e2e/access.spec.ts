import { expect, test } from "@playwright/test";

test.describe("pantalla de acceso", () => {
  test("prioriza el ingreso y mantiene las herramientas de desarrollo separadas", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByText("Kinesiología domiciliaria", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { level: 1, name: "Pacientes, visitas y tratamientos en un solo lugar." })).toBeVisible();
    const primary = page.getByRole("link", { name: "Ingresar", exact: true });
    await expect(primary).toBeVisible();
    await expect(primary).toHaveAttribute("href", "/ingresar");
    await expect(page.getByRole("link", { name: "¿Problemas para ingresar?" })).toHaveAttribute("href", "/recuperar");
    await expect(page.getByText("Entorno local · datos ficticios")).toBeVisible();
    await expect(page.locator(".developer-tools")).toBeVisible();
    await expect(page.locator(".developer-tools").locator("details")).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
});
