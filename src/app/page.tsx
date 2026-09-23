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
        <h1 id="page-title">Kinesiología domiciliaria</h1>
        <p className="access-title">Toda la gestión de tus visitas en una sola app.</p>
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

    </main>
  );
}
