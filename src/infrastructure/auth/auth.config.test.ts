import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { readAuthConfig } from "./auth.config";

describe("readAuthConfig", () => {
  it("deriva el RP ID del hostname y excluye el puerto", () => {
    expect(readAuthConfig({
      AUTH_ORIGIN: "https://dev-pc.local:3000",
      AUTH_DB_PATH: ".local/auth.sqlite",
      NODE_ENV: "development",
    })).toMatchObject({
      origin: "https://dev-pc.local:3000",
      rpID: "dev-pc.local",
    });
  });

  it("mantiene permitido HTTP solo para localhost", () => {
    expect(readAuthConfig({
      AUTH_ORIGIN: "http://localhost:3000",
      AUTH_DB_PATH: ".local/auth.sqlite",
      NODE_ENV: "development",
    })).toMatchObject({ rpID: "localhost" });
    expect(readAuthConfig({
      AUTH_ORIGIN: "http://dev-pc.local:3000",
      AUTH_DB_PATH: ".local/auth.sqlite",
      NODE_ENV: "development",
    })).toBeNull();
  });
});
