import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  globalSetup: "./tests/e2e/global-setup.ts",
  globalTeardown: "./tests/e2e/global-teardown.ts",
  use: {
    baseURL: "http://localhost:3100",
    channel: "chrome",
    storageState: ".local/e2e-storage.json",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "desktop-chrome", use: { ...devices["Desktop Chrome"] }, testIgnore: /mobile\.spec\.ts/ },
    { name: "mobile-chrome", use: { ...devices["Pixel 7"], channel: "chrome" }, testMatch: /mobile\.spec\.ts/ },
  ],
  webServer: {
    command: "npm run seed:clinical-home && next dev --webpack -p 3100",
    url: "http://localhost:3100/ingresar",
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      FHIR_BASE_URL: "http://localhost:8081/fhir",
      AUTH_ORIGIN: "http://localhost:3100",
      AUTH_DB_PATH: ".local/e2e-auth.sqlite",
      NEXT_DIST_DIR: ".next-e2e",
    },
  },
});
