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
  return (
    <main className="shell">
      <section className="intro" aria-labelledby="page-title">
        <p className="eyebrow">Aplicación privada · Fundación inicial</p>
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
        El acceso clínico todavía no está habilitado. Esta versión valida la
        base técnica antes de incorporar información de pacientes.
      </p>
    </main>
  );
}
