import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { listActivePatients } from "@/application/patients/list-active-patients";
import { createActivePatientDependencies } from "@/infrastructure/fhir/create-active-patient-dependencies";
import { canRenderLocalClinicalSurface } from "@/infrastructure/runtime/local-clinical-surface";
import { presentActivePatients } from "./active-patient-list.presenter";

export const metadata: Metadata = {
  title: "Pacientes activos · Kinesiología Clínica",
};

export const dynamic = "force-dynamic";

export default async function ActivePatientsPage() {
  if (!canRenderLocalClinicalSurface()) {
    notFound();
  }

  const patients = presentActivePatients(
    await listActivePatients(createActivePatientDependencies()),
  );

  return (
    <main className="shell clinical-shell">
      <header className="clinical-header">
        <div>
          <p className="eyebrow">Entorno local · Datos ficticios</p>
          <h1>Pacientes activos</h1>
          <p className="lede">
            Tratamientos en curso disponibles para continuar el trabajo clínico.
          </p>
        </div>
        <Link className="back-link clinical-back-link" href="/">
          Volver al inicio
        </Link>
      </header>

      {patients.length === 0 ? (
        <section className="empty-state" aria-labelledby="empty-title">
          <h2 id="empty-title">No hay pacientes activos</h2>
          <p>
            La lista mostrará pacientes que tengan un tratamiento `EpisodeOfCare`
            con estado activo.
          </p>
        </section>
      ) : (
        <section aria-labelledby="patient-count">
          <div className="list-heading">
            <h2 id="patient-count">
              {patients.length} {patients.length === 1 ? "paciente" : "pacientes"}
            </h2>
            <p>Ordenados alfabéticamente</p>
          </div>

          <ul className="patient-list">
            {patients.map((patient) => (
              <li className="patient-card" key={patient.id}>
                <div>
                  <h3>{patient.displayName}</h3>
                  <p>Tratamiento iniciado el {patient.treatmentStartLabel}</p>
                </div>
                <span className="status-badge">Activo</span>
                {patient.dataQuality.multipleActiveTreatments ? (
                  <p className="data-quality-warning" role="status">
                    Hay más de un tratamiento activo. Se muestra el más reciente.
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="clinical-footnote">
        Vista temporal de solo lectura. Todavía no contiene autenticación ni permite
        modificar información.
      </p>
    </main>
  );
}
