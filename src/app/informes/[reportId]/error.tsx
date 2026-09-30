"use client";
import Link from "next/link";
export default function ReportError({reset}:{reset:()=>void}) {
 return <main className="shell clinical-shell"><h1>No se pudo verificar el informe</h1><p role="alert">La lectura y descarga quedaron bloqueadas. Puede haber un problema de integridad o de conexión. Si continúa, hace falta revisar el registro clínico.</p><button className="button-link" onClick={reset}>Volver a comprobar</button><Link className="back-link" href="/inicio?vista=pacientes">Volver a pacientes</Link></main>;
}
