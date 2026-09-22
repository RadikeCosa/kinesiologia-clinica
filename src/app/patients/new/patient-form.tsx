"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { submitPatient, type PatientCreationState } from "./actions";

const initial: PatientCreationState = {};
export function PatientForm() {
  const router = useRouter(); const [clientId] = useState(() => crypto.randomUUID());
  const [state, action, pending] = useActionState(submitPatient, initial);
  useEffect(() => { if (state.patientId) router.replace(`/patients/${encodeURIComponent(state.patientId)}`); }, [router, state.patientId]);
  return <form action={action} className="visit-form patient-admin-form">
    <input type="hidden" name="clientId" value={clientId}/>
    <div className="form-grid"><label>Nombre<input name="givenName" required autoComplete="given-name"/></label><label>Apellido<input name="familyName" required autoComplete="family-name"/></label></div>
    <label>Teléfono<input name="phone" required type="tel" autoComplete="tel"/></label>
    <label>Dirección<input name="address" required autoComplete="street-address"/></label>
    <details className="clinical-module"><summary>Indicaciones para llegar · opcional</summary><label><span>Acceso, piso, timbre u otra referencia</span><textarea name="accessInstructions" rows={3} maxLength={2000}/></label></details>
    {state.duplicate ? <div className="context-alert" role="alert"><strong>Ya existe una ficha con ese teléfono</strong><p><Link href={`/patients/${state.duplicate.id}`}>{state.duplicate.name}</Link></p><label className="home-confirm"><input type="checkbox" name="createAnyway" value="true"/> Crear de todos modos</label></div> : null}
    {state.error ? <p className="form-error" role="alert">{state.error}</p> : null}
    <div className="form-actions"><Link className="button-link" href="/inicio?vista=pacientes">Cancelar</Link><button className="submit-button" disabled={pending}>{pending ? "Creando…" : "Crear paciente"}</button></div>
  </form>;
}
