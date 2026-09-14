import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { readAuthConfig, type AuthConfig } from "./auth.config";
import { openAuthStore, type AuthStore, type StoredSession } from "./auth-store";

export const SESSION_COOKIE = "clinical_session";
export const CHALLENGE_COOKIE = "clinical_challenge";

export function getAuthContext(): { config: AuthConfig; store: AuthStore } {
  const config = readAuthConfig();
  if (!config) throw new Error("El acceso privado no está configurado.");
  return { config, store: openAuthStore(config) };
}

export function sessionFromRequest(request: NextRequest, store: AuthStore): StoredSession | null {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  return token ? store.getSession(token) : null;
}

export async function currentSession(): Promise<StoredSession | null> {
  const config = readAuthConfig();
  if (!config) return null;
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return token ? openAuthStore(config).getSession(token) : null;
}

export async function requireClinicalSession(): Promise<StoredSession> {
  const session = await currentSession();
  if (!session) redirect("/ingresar");
  return session;
}

export function isAllowedOrigin(request: NextRequest, config: AuthConfig) {
  return request.headers.get("origin") === config.origin;
}

export async function readSmallJson(request: NextRequest): Promise<Record<string, unknown>> {
  const length = Number(request.headers.get("content-length") ?? "0");
  if (length > 40_000) throw new Error("Solicitud demasiado grande.");
  const raw = await request.text();
  if (raw.length > 40_000) throw new Error("Solicitud demasiado grande.");
  const value: unknown = JSON.parse(raw);
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Solicitud inválida.");
  return value as Record<string, unknown>;
}

export function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

function cookieOptions(config: AuthConfig, maxAge: number) {
  return { httpOnly: true, secure: config.origin.startsWith("https:"), sameSite: "strict" as const, path: "/", maxAge };
}

export function setChallengeCookie(response: NextResponse, config: AuthConfig, token: string) {
  response.cookies.set(CHALLENGE_COOKIE, token, cookieOptions(config, 5 * 60));
  return response;
}

export function clearChallengeCookie(response: NextResponse) {
  response.cookies.delete(CHALLENGE_COOKIE);
  return response;
}

export function setSessionCookie(response: NextResponse, config: AuthConfig, token: string) {
  response.cookies.set(SESSION_COOKIE, token, cookieOptions(config, 30 * 24 * 60 * 60));
  return response;
}

export function clearSessionCookie(response: NextResponse) {
  response.cookies.delete(SESSION_COOKIE);
  return response;
}
