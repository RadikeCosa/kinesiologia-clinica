"use client";

import Link from "next/link";
import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { savePatient, type PatientActionState } from "./patient-actions";
import type { Patient } from "@/domain/patient/patient";

const initial: PatientActionState = {};

export function PatientForm({ patient }: { patient: Patient }) {
  const router = useRouter();
  const [state, action, pending] = useActionState(savePatient, initial);
  useEffect(() => { if (state.success) router.replace(`/patients/${encodeURIComponent(patient.id)}`); }, [patient.id, router, state.success]);
  return <form action={action} className="visit-form patient-admin-form">
    <input type="hidden" name="patientId" value={patient.id}/>
    <input type="hidden" name="clientId" value={patient.id.replace(/^patient-/, "")}/>
    <input type="hidden" name="expectedVersion" value={patient.version ?? ""}/>
    <div className="form-grid"><label>Nombre<input name="givenName" defaultValue={patient.givenName} required autoComplete="given-name" aria-describedby="patient-form-error"/></label><label>Apellido<input name="familyName" defaultValue={patient.familyName} required autoComplete="family-name" aria-describedby="patient-form-error"/></label></div>
    <label>Teléfono<input name="phone" defaultValue={patient.phone} required type="tel" autoComplete="tel" aria-describedby="patient-form-error"/></label>
    <label>Dirección<input name="address" defaultValue={patient.address} required autoComplete="street-address" aria-describedby="patient-form-error"/></label>
    <details className="clinical-module" open={Boolean(patient.accessInstructions)}><summary>Indicaciones para llegar · opcional</summary><label><span>Acceso, piso, timbre u otra referencia</span><textarea name="accessInstructions" defaultValue={patient.accessInstructions} rows={3} maxLength={2000}/></label></details>
    {state.error ? <p className="form-error" id="patient-form-error" role="alert">{state.error}</p> : null}
    <div className="form-actions"><Link className="button-link" href={`/patients/${encodeURIComponent(patient.id)}`}>Cancelar</Link><button className="submit-button" disabled={pending}>{pending ? "Guardando…" : "Guardar cambios"}</button></div>
  </form>;
}
