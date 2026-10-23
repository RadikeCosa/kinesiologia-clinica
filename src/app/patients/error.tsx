"use client";
import { ClinicalEnvironmentLabel } from "@/app/clinical-environment";

export default function ActivePatientsError({ reset }: { reset: () => void }) {
  return (
    <main className="shell clinical-shell">
      <p className="eyebrow">{<ClinicalEnvironmentLabel/>}</p>
      <h1>No se pudo cargar la lista</h1>
      <div className="diagnostic-message diagnostic-message-error">
        <p>
          Comprobá que el servidor HAPI de desarrollo esté disponible en `8081` y
          volvé a intentar.
        </p>
        <button className="secondary-button" onClick={reset} type="button">
          Reintentar
        </button>
      </div>
    </main>
  );
}
