import type { Metadata } from "next";
import Link from "next/link";
import { PasskeyDiagnostic } from "./PasskeyDiagnostic";

export const metadata: Metadata = {
  title: "Diagnóstico de passkeys · Kinesiología Clínica",
};

export default function PasskeyDiagnosticPage() {
  return (
    <main className="shell diagnostic-shell">
      <Link className="back-link" href="/">
        ← Volver
      </Link>

      <section className="intro" aria-labelledby="page-title">
        <p className="eyebrow">Prueba técnica · Sin datos clínicos</p>
        <h1 id="page-title">¿Este dispositivo está listo para usar passkeys?</h1>
        <p className="lede">
          Esta pantalla revisa las capacidades básicas del navegador. La vamos a
          comparar en Ubuntu y en el teléfono antes de elegir la autenticación
          definitiva.
        </p>
      </section>

      <PasskeyDiagnostic />

      <aside className="diagnostic-note" aria-label="Alcance de la prueba">
        <h2>Qué todavía no demuestra</h2>
        <p>
          No prueba el alta de la credencial, su sincronización entre dispositivos,
          la validación criptográfica del servidor ni la persistencia de una sesión.
          Esas verificaciones forman la segunda capa del ensayo.
        </p>
      </aside>
    </main>
  );
}
