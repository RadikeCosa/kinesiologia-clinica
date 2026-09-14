import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from "@simplewebauthn/server";
import { beginLogin, beginRecovery, beginRegistration, finishLogin, finishRecovery, finishRegistration } from "@/application/auth/passkey-service";
import { CHALLENGE_COOKIE, clearChallengeCookie, clearSessionCookie, getAuthContext, isAllowedOrigin, json, readSmallJson, sessionFromRequest, setChallengeCookie, setSessionCookie } from "@/infrastructure/auth/auth-http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function operationKey(parts: string[]) { return parts.join("/"); }

export async function POST(request: NextRequest, { params }: { params: Promise<{ operation: string[] }> }) {
  const operation = operationKey((await params).operation);
  let context: ReturnType<typeof getAuthContext>;
  try { context = getAuthContext(); } catch { return json({ error: "El acceso privado no está configurado." }, 503); }
  const { config, store } = context;
  if (!isAllowedOrigin(request, config)) return json({ error: "Origen no permitido." }, 403);
  let body: Record<string, unknown>;
  try { body = await readSmallJson(request); } catch { return json({ error: "Solicitud inválida." }, 400); }
  const session = sessionFromRequest(request, store);
  try {
    if (operation === "registration/options") {
      const result = await beginRegistration({ store, config, bootstrapToken: typeof body.bootstrapToken === "string" ? body.bootstrapToken : undefined, sessionId: session?.id });
      return setChallengeCookie(json(result.options), config, result.challengeToken);
    }
    if (operation === "registration/verify") {
      const challengeToken = request.cookies.get(CHALLENGE_COOKIE)?.value;
      if (!challengeToken || !body.response || typeof body.response !== "object") return json({ error: "Solicitud inválida." }, 400);
      const result = await finishRegistration({ store, config, challengeToken, response: body.response as RegistrationResponseJSON, label: typeof body.label === "string" ? body.label : "Dispositivo" });
      const response = clearChallengeCookie(json({ ok: true, recoveryCodes: result.recoveryCodes }));
      return setSessionCookie(response, config, result.token);
    }
    if (operation === "login/options") {
      const result = await beginLogin(store, config);
      return setChallengeCookie(json(result.options), config, result.challengeToken);
    }
    if (operation === "login/verify") {
      const challengeToken = request.cookies.get(CHALLENGE_COOKIE)?.value;
      if (!challengeToken || !body.response || typeof body.response !== "object") return json({ error: "Solicitud inválida." }, 400);
      const result = await finishLogin({ store, config, challengeToken, response: body.response as AuthenticationResponseJSON });
      const response = clearChallengeCookie(json({ ok: true }));
      return setSessionCookie(response, config, result.token);
    }
    if (operation === "recovery/options") {
      const result = await beginRecovery({ store, config, code: typeof body.code === "string" ? body.code : "" });
      return setChallengeCookie(json(result.options), config, result.challengeToken);
    }
    if (operation === "recovery/verify") {
      const challengeToken = request.cookies.get(CHALLENGE_COOKIE)?.value;
      if (!challengeToken || !body.response || typeof body.response !== "object") return json({ error: "Solicitud inválida." }, 400);
      const result = await finishRecovery({ store, config, challengeToken, response: body.response as RegistrationResponseJSON, label: typeof body.label === "string" ? body.label : "Dispositivo recuperado" });
      const response = clearChallengeCookie(json({ ok: true, recoveryCodes: result.recoveryCodes }));
      return setSessionCookie(response, config, result.token);
    }
    if (operation === "logout") {
      if (session) store.revokeSession(session.id);
      return clearSessionCookie(json({ ok: true }));
    }
    if (operation === "session/refresh") {
      if (!session) return json({ error: "Acceso requerido." }, 401);
      store.touchSession(session.id);
      const response = json({ ok: true });
      const token = request.cookies.get("clinical_session")?.value;
      return token ? setSessionCookie(response, config, token) : response;
    }
    if (operation === "recovery/rotate") {
      if (!session) return json({ error: "Acceso requerido." }, 401);
      const recoveryCodes = Array.from({ length: 10 }, () => randomBytes(16).toString("hex"));
      store.replaceRecoveryCodes(recoveryCodes);
      return json({ ok: true, recoveryCodes });
    }
    if (operation === "sessions/revoke") {
      if (!session) return json({ error: "Acceso requerido." }, 401);
      const id = typeof body.id === "string" ? body.id : "";
      if (!/^[0-9a-f-]{36}$/.test(id)) return json({ error: "Sesión inválida." }, 400);
      const revoked = store.revokeSession(id);
      const response = json({ ok: revoked });
      return id === session.id ? clearSessionCookie(response) : response;
    }
    if (operation === "passkeys/revoke") {
      if (!session) return json({ error: "Acceso requerido." }, 401);
      const id = typeof body.id === "string" ? body.id : "";
      if (!id || id.length > 512) return json({ error: "Passkey inválida." }, 400);
      const revoked = store.deletePasskey(id);
      const response = json({ ok: revoked, loggedOut: session.credentialId === id && revoked });
      return session.credentialId === id && revoked ? clearSessionCookie(response) : response;
    }
  } catch {
    return json({ error: "No se pudo completar la operación de acceso. Volvé a intentar." }, 400);
  }
  return json({ error: "Operación desconocida." }, 404);
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ operation: string[] }> }) {
  const operation = operationKey((await params).operation);
  if (operation !== "sessions") return json({ error: "Operación desconocida." }, 404);
  let context: ReturnType<typeof getAuthContext>;
  try { context = getAuthContext(); } catch { return json({ error: "El acceso privado no está configurado." }, 503); }
  const session = sessionFromRequest(request, context.store);
  if (!session) return json({ error: "Acceso requerido." }, 401);
  return NextResponse.json({
    currentSessionId: session.id,
    sessions: context.store.listSessions().map((item) => ({ id: item.id, label: item.label, createdAt: item.createdAt, lastSeenAt: item.lastSeenAt, expiresAt: item.expiresAt })),
    passkeys: context.store.listPasskeys().map((item) => ({ id: item.id, label: item.label, createdAt: item.createdAt, lastUsedAt: item.lastUsedAt })),
  }, { headers: { "Cache-Control": "no-store" } });
}
