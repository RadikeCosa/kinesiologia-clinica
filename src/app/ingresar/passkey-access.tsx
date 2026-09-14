"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { startAuthentication, startRegistration } from "@simplewebauthn/browser";

type AccessMode = "login" | "bootstrap" | "register" | "recovery";

async function post(path: string, body: Record<string, unknown>) {
  const response = await fetch(`/api/auth/${path}`, {
    method: "POST", credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json() as Record<string, unknown>;
  if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "No se pudo completar el acceso.");
  return data;
}

export function PasskeyAccess({ mode }: { mode: AccessMode }) {
  const router = useRouter();
  const [bootstrapToken, setBootstrapToken] = useState("");
  const [recoveryCode, setRecoveryCode] = useState("");
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [codes, setCodes] = useState<string[]>([]);

  async function run() {
    setBusy(true);
    setError("");
    try {
      if (mode === "login") {
        const options = await post("login/options", {});
        const result = await startAuthentication({ optionsJSON: options as unknown as Parameters<typeof startAuthentication>[0]["optionsJSON"] });
        await post("login/verify", { response: result });
        router.replace("/patients"); router.refresh();
      } else {
        const prefix = mode === "recovery" ? "recovery" : "registration";
        const options = await post(`${prefix}/options`, mode === "bootstrap" ? { bootstrapToken } : mode === "recovery" ? { code: recoveryCode } : {});
        const result = await startRegistration({ optionsJSON: options as unknown as Parameters<typeof startRegistration>[0]["optionsJSON"] });
        const verified = await post(`${prefix}/verify`, { response: result, label });
        if (Array.isArray(verified.recoveryCodes) && verified.recoveryCodes.length) {
          setCodes(verified.recoveryCodes.filter((item): item is string => typeof item === "string"));
        } else {
          router.replace(mode === "register" ? "/configuracion/dispositivos" : "/patients"); router.refresh();
        }
      }
    } catch {
      setError("No se pudo completar la verificación. Revisá los datos e intentá otra vez.");
    } finally {
      setBusy(false);
    }
  }

  if (codes.length) return <section className="clinical-panel access-panel">
    <h2>Guardá estos códigos de recuperación</h2>
    <p>Se muestran una sola vez. Cada código permite recuperar el acceso y registrar una passkey nueva. Guardalos fuera del teléfono.</p>
    <ol className="recovery-codes">{codes.map((code) => <li key={code}><code>{code}</code></li>)}</ol>
    <Link className="primary-link" href="/patients">Ya los guardé</Link>
  </section>;

  return <section className="clinical-panel access-panel">
    <h2>{mode === "login" ? "Ingresar con passkey" : mode === "bootstrap" ? "Registrar la primera passkey" : mode === "recovery" ? "Recuperar acceso" : "Agregar passkey"}</h2>
    {mode === "bootstrap" ? <label>Código inicial<input type="password" autoComplete="off" value={bootstrapToken} onChange={(event) => setBootstrapToken(event.target.value)} /></label> : null}
    {mode === "recovery" ? <label>Código de recuperación<input type="text" autoComplete="off" value={recoveryCode} onChange={(event) => setRecoveryCode(event.target.value)} /></label> : null}
    {mode !== "login" ? <label>Nombre del dispositivo<input type="text" maxLength={60} value={label} onChange={(event) => setLabel(event.target.value)} placeholder="Por ejemplo: teléfono o computadora" /></label> : null}
    {error ? <p className="form-error" role="alert">{error}</p> : null}
    <button className="submit-button" type="button" disabled={busy || (mode === "bootstrap" && !bootstrapToken) || (mode === "recovery" && !recoveryCode)} onClick={run}>
      {busy ? "Verificando…" : mode === "login" ? "Usar passkey" : "Continuar con passkey"}
    </button>
  </section>;
}
