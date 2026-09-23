import Link from "next/link";
import { canRenderLocalClinicalSurface } from "@/infrastructure/runtime/local-clinical-surface";

const foundations = [
  {
    title: "Pacientes activos",
    description: "Organizar tratamientos, contexto y próximas acciones.",
  },
  {
    title: "Visitas",
    description: "Registrar durante la atención o completar después.",
  },
  {
    title: "Evolución e informes",
    description: "Reutilizar lo registrado sin reconstruir todo a mano.",
  },
];

export default function Home() {
  const localClinicalSurfaceEnabled = canRenderLocalClinicalSurface();

  return (
    <main className="shell access-landing-shell">
      <section className="intro access-intro" aria-labelledby="page-title">
        <p className="eyebrow">Kinesiología domiciliaria</p>
        <h1 id="page-title">Pacientes, visitas y tratamientos en un solo lugar.</h1>
        <p className="lede">
          Organizá la atención domiciliaria, registrá cada visita y consultá la evolución
          sin volver a escribir lo mismo.
        </p>
      </section>

      {localClinicalSurfaceEnabled ? <section className="access-actions" aria-label="Acceso a la aplicación">
        <Link className="primary-link access-primary-link" href="/ingresar">Ingresar</Link>
        <Link className="diagnostic-link access-recovery-link" href="/recuperar">¿Problemas para ingresar?</Link>
      </section> : null}

      <section className="foundation-grid access-foundation-grid" aria-label="Qué podés hacer">
        {foundations.map((foundation) => (
          <article className="foundation-card" key={foundation.title}>
            <h2>{foundation.title}</h2>
            <p>{foundation.description}</p>
          </article>
        ))}
      </section>

      <p className="status access-environment-note">Entorno local · datos ficticios</p>

      {localClinicalSurfaceEnabled && process.env.NODE_ENV === "development" ? (
        <details className="developer-tools">
          <summary>Herramientas de desarrollo</summary>
          <div className="developer-tools-links">
            <Link className="diagnostic-link" href="/diagnostico/passkeys">Comprobar compatibilidad con passkeys</Link>
            <Link className="diagnostic-link" href="/laboratorio/inicio">Abrir laboratorio de la pantalla inicial</Link>
          </div>
        </details>
      ) : null}
    </main>
  );
}
