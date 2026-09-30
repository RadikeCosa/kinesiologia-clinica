"use client";
import { useParams } from "next/navigation";
import Link from "next/link";
export default function PeriodError({reset}:{reset:()=>void}) {
 const params=useParams<{id:string}>();
 return <main className="shell clinical-shell"><h1>No se pudo verificar el informe</h1><p role="alert">La consulta quedó bloqueada. Puede haber un problema de integridad o de conexión con el registro clínico.</p><button className="button-link" onClick={reset}>Volver a comprobar</button><Link className="back-link" href={`/patients/${encodeURIComponent(params.id)}`}>Volver al paciente</Link></main>;
}
