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
    <main className="shell">
      <section className="intro" aria-labelledby="page-title">
        <p className="eyebrow">Aplicación privada · Piloto local</p>
        <h1 id="page-title">Registrar una vez. Comunicar y reportar sin volver a escribir.</h1>
        <p className="lede">
          Nueva superficie clínico-operativa, pensada primero para el teléfono
          y para el trabajo real de atención domiciliaria.
        </p>
      </section>

      <section className="foundation-grid" aria-label="Núcleo del producto">
        {foundations.map((foundation) => (
          <article className="foundation-card" key={foundation.title}>
            <h2>{foundation.title}</h2>
            <p>{foundation.description}</p>
          </article>
        ))}
      </section>

      <p className="status">
        El piloto clínico solo está disponible localmente con datos ficticios.
        El acceso con passkeys está implementado y todavía debe validarse por completo
        antes de incorporar datos reales.
      </p>

      <Link className="diagnostic-link" href="/diagnostico/passkeys">
        Comprobar compatibilidad con passkeys
      </Link>

      {localClinicalSurfaceEnabled ? (
        <>
          <Link className="primary-link" href="/ingresar">
            Ingresar al piloto local
          </Link>
          {process.env.NODE_ENV === "development" ? (
            <Link className="diagnostic-link" href="/laboratorio/inicio">
              Abrir laboratorio de la pantalla inicial
            </Link>
          ) : null}
        </>
      ) : null}
    </main>
  );
}
