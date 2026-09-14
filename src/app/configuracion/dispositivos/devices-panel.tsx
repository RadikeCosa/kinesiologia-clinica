"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface DeviceState {
  currentSessionId: string;
  sessions: Array<{ id: string; label: string; createdAt: number; lastSeenAt: number; expiresAt: number }>;
  passkeys: Array<{ id: string; label: string; createdAt: number; lastUsedAt: number | null }>;
}

function formatDate(value: number) { return new Date(value).toLocaleString("es-AR"); }

export function DevicesPanel() {
  const router = useRouter();
  const [state, setState] = useState<DeviceState | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);

  async function load() {
    const response = await fetch("/api/auth/sessions", { credentials: "same-origin", cache: "no-store" });
    if (!response.ok) throw new Error();
    setState(await response.json() as DeviceState);
  }

  useEffect(() => {
    let active = true;
    void fetch("/api/auth/sessions", { credentials: "same-origin", cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        return response.json() as Promise<DeviceState>;
      })
      .then((data) => { if (active) setState(data); })
      .catch(() => { if (active) setError("No se pudieron cargar los dispositivos."); });
    return () => { active = false; };
  }, []);

  async function post(path: string, id?: string) {
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/auth/${path}`, { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(id ? { id } : {}) });
      if (!response.ok) throw new Error();
      const result = await response.json() as { ok: boolean; loggedOut?: boolean };
      if (!result.ok) throw new Error();
      if (path === "logout" || id === state?.currentSessionId || result.loggedOut) { router.replace("/ingresar"); router.refresh(); return; }
      await load();
    } catch { setError("No se pudo completar el cambio. Intentá otra vez."); }
    finally { setBusy(false); }
  }

  async function rotateRecoveryCodes() {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/auth/recovery/rotate", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: "{}" });
      if (!response.ok) throw new Error();
      const result = await response.json() as { recoveryCodes: string[] };
      setRecoveryCodes(result.recoveryCodes);
    } catch { setError("No se pudieron renovar los códigos."); }
    finally { setBusy(false); }
  }

  return <section className="clinical-panel access-panel">
    <h2>Sesiones activas</h2>
    {error ? <p className="form-error" role="alert">{error}</p> : null}
    {!state ? <p>Cargando…</p> : <>
      <ul className="device-list">{state.sessions.map((session) => <li key={session.id}>
        <div><strong>{session.label}{session.id === state.currentSessionId ? " · Esta sesión" : ""}</strong><small>Última actividad: {formatDate(session.lastSeenAt)}</small></div>
        <button className="secondary-button" disabled={busy} onClick={() => void post("sessions/revoke", session.id)}>Revocar sesión</button>
      </li>)}</ul>
      <h2>Passkeys registradas</h2>
      <ul className="device-list">{state.passkeys.map((passkey) => <li key={passkey.id}>
        <div><strong>{passkey.label}</strong><small>Registrada: {formatDate(passkey.createdAt)}</small></div>
        <button className="secondary-button" disabled={busy || state.passkeys.length <= 1} onClick={() => void post("passkeys/revoke", passkey.id)}>Revocar passkey</button>
      </li>)}</ul>
      <p className="clinical-footnote">Revocar una sesión cierra ese navegador, pero no elimina una passkey que pueda volver a usarse. Conservá al menos una passkey y tus códigos de recuperación.</p>
      <h2>Códigos de recuperación</h2>
      {recoveryCodes.length ? <><p>Guardá estos códigos nuevos fuera del teléfono. Los anteriores ya no sirven.</p><ol className="recovery-codes">{recoveryCodes.map((code) => <li key={code}><code>{code}</code></li>)}</ol><button className="secondary-button" onClick={() => setRecoveryCodes([])}>Ya los guardé</button></> : <button className="secondary-button" disabled={busy} onClick={() => void rotateRecoveryCodes()}>Renovar códigos</button>}
      <button className="secondary-button" disabled={busy} onClick={() => void post("logout")}>Cerrar esta sesión</button>
    </>}
  </section>;
}
