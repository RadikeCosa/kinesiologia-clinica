"use client";

import { useEffect, useState } from "react";
import {
  detectPasskeyCapabilities,
  type PasskeyCapabilityResult,
} from "@/application/auth/passkey-capabilities";

type DiagnosticState =
  | { phase: "checking" }
  | { phase: "complete"; result: PasskeyCapabilityResult }
  | { phase: "error" };

const valueLabels = {
  true: "Disponible",
  false: "No disponible",
  null: "El navegador no lo informa",
} as const;

function ResultRow({ label, value }: { label: string; value: boolean | null }) {
  return (
    <div className="diagnostic-row">
      <dt>{label}</dt>
      <dd data-result={value === true ? "positive" : value === false ? "negative" : "unknown"}>
        {valueLabels[String(value) as keyof typeof valueLabels]}
      </dd>
    </div>
  );
}

async function runDiagnostic(): Promise<PasskeyCapabilityResult> {
  return detectPasskeyCapabilities({
    secureContext: window.isSecureContext,
    publicKeyCredential:
      typeof window.PublicKeyCredential === "undefined"
        ? undefined
        : window.PublicKeyCredential,
  });
}

export function PasskeyDiagnostic() {
  const [state, setState] = useState<DiagnosticState>({ phase: "checking" });

  async function check() {
    setState({ phase: "checking" });

    try {
      setState({ phase: "complete", result: await runDiagnostic() });
    } catch {
      setState({ phase: "error" });
    }
  }

  useEffect(() => {
    let active = true;

    void runDiagnostic()
      .then((result) => {
        if (active) {
          setState({ phase: "complete", result });
        }
      })
      .catch(() => {
        if (active) {
          setState({ phase: "error" });
        }
      });

    return () => {
      active = false;
    };
  }, []);

  if (state.phase === "checking") {
    return <p className="diagnostic-message">Comprobando este dispositivo…</p>;
  }

  if (state.phase === "error") {
    return (
      <div className="diagnostic-message diagnostic-message-error">
        <p>No se pudo completar la comprobación.</p>
        <button className="secondary-button" onClick={check} type="button">
          Volver a probar
        </button>
      </div>
    );
  }

  const { result } = state;

  return (
    <section aria-labelledby="diagnostic-results" className="diagnostic-panel">
      <div>
        <p className="eyebrow">Resultado en este dispositivo</p>
        <h2 id="diagnostic-results">
          {result.status === "ready"
            ? "Base compatible con passkeys"
            : result.status === "partial"
              ? "Compatibilidad parcial"
              : "Passkeys bloqueadas en este contexto"}
        </h2>
      </div>

      <dl className="diagnostic-results">
        <ResultRow label="Conexión segura" value={result.secureContext} />
        <ResultRow label="API WebAuthn" value={result.webAuthn} />
        <ResultRow
          label="Autenticador local con verificación"
          value={result.platformAuthenticator}
        />
        <ResultRow
          label="Acceso condicional desde el navegador"
          value={result.conditionalMediation}
        />
      </dl>

      <div className="diagnostic-explanation">
        {result.status === "ready" ? (
          <p>
            Este navegador informa que puede autenticar usando una passkey local o
            integrada. El siguiente ensayo será crear una credencial y verificarla
            en el servidor.
          </p>
        ) : result.status === "partial" ? (
          <p>
            WebAuthn funciona, pero no aparece un autenticador local. Todavía puede
            servir una passkey sincronizada por el navegador, un gestor de
            contraseñas o una llave FIDO2 USB.
          </p>
        ) : (
          <p>
            La prueba necesita HTTPS —o localhost— y un navegador con WebAuthn.
            Revisá esas condiciones antes de repetirla.
          </p>
        )}
        <p>
          Esta comprobación no crea una cuenta, no guarda una passkey y no consulta
          información clínica.
        </p>
      </div>

      <button className="secondary-button" onClick={check} type="button">
        Repetir comprobación
      </button>
    </section>
  );
}
