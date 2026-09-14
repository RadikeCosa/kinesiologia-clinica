import "server-only";

import { isAbsolute, resolve } from "node:path";

export interface AuthConfig {
  origin: string;
  rpID: string;
  dbPath: string;
  bootstrapToken?: string;
}

export function readAuthConfig(environment: NodeJS.ProcessEnv = process.env): AuthConfig | null {
  const rawOrigin = environment.AUTH_ORIGIN;
  const rawPath = environment.AUTH_DB_PATH;
  if (!rawOrigin || !rawPath) return null;
  let origin: URL;
  try { origin = new URL(rawOrigin); } catch { return null; }
  if (origin.pathname !== "/" || origin.search || origin.hash || origin.username || origin.password) return null;
  const isLocal = origin.hostname === "localhost" || origin.hostname === "127.0.0.1";
  if (origin.protocol !== "https:" && !(isLocal && origin.protocol === "http:")) return null;
  if (environment.NODE_ENV === "production" && !isLocal && !isAbsolute(rawPath)) return null;
  const bootstrapToken = environment.AUTH_BOOTSTRAP_TOKEN;
  if (bootstrapToken && bootstrapToken.length < 32) return null;
  return {
    origin: origin.origin,
    rpID: origin.hostname,
    dbPath: resolve(rawPath),
    bootstrapToken,
  };
}
