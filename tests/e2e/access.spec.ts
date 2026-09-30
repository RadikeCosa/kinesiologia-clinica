import { expect, test } from "@playwright/test";

test.describe("pantalla de acceso", () => {
  test("prioriza el ingreso y mantiene una entrada clínica limpia", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("heading", { level: 1, name: "Kinesiología domiciliaria" })).toBeVisible();
    await expect(page.getByText("Toda la gestión de tus visitas en una sola app.", { exact: true })).toBeVisible();
    const primary = page.getByRole("link", { name: "Ingresar", exact: true });
    await expect(primary).toBeVisible();
    await expect(primary).toHaveAttribute("href", "/ingresar");
    await expect(page.getByRole("link", { name: "¿Problemas para ingresar?" })).toHaveAttribute("href", "/recuperar");
    await expect(page.getByText("Entorno local · datos ficticios")).toBeVisible();
    await expect(page.getByText("Herramientas de desarrollo")).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });

  test("explica por qué no se puede revocar la única passkey", async ({ page }) => {
    await page.goto("/configuracion/dispositivos");

    const revokePasskey = page.getByRole("button", { name: "Revocar passkey" });
    await expect(revokePasskey).toBeDisabled();
    await expect(revokePasskey).toHaveAttribute("aria-describedby", /passkey-revoke-help-/);
    await expect(page.getByText("Es la única passkey; no se puede revocar para evitar perder el acceso.")).toBeVisible();
  });
});
