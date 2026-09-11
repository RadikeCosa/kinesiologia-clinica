export default function ActivePatientsLoading() {
  return (
    <main className="shell clinical-shell" aria-busy="true">
      <p className="eyebrow">Entorno local · Datos ficticios</p>
      <h1>Pacientes activos</h1>
      <p className="diagnostic-message">Cargando pacientes activos…</p>
    </main>
  );
}
