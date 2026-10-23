"use client";

import { ConsultationPrivacyNote } from "@/app/clinical-environment";
import Link from "next/link";
import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { submitConsultation, type ConsultationCreationState } from "./actions";

const initial: ConsultationCreationState = {};
function derivedId(id: string, increment: number) { const last = Number.parseInt(id.at(-1) ?? "0", 16); return `${id.slice(0, -1)}${((last + increment) % 16).toString(16)}`; }
export function ConsultationForm({ operationId }: { operationId: string }) {
  const router = useRouter();
  const [state, action, pending] = useActionState(submitConsultation, initial);
  useEffect(() => { if (state.consultationId) router.replace(`/consultas/${encodeURIComponent(state.consultationId)}`); }, [router, state.consultationId]);

  return <form action={action} className="visit-form patient-admin-form">
    <input type="hidden" name="clientId" value={operationId}/>
    <input type="hidden" name="contactId" value={derivedId(operationId, 1)}/>
    <input type="hidden" name="patientContactId" value={derivedId(operationId, 2)}/>
    <section className="clinical-module" aria-labelledby="patient-heading">
      <h2 id="patient-heading">Paciente</h2>
      <p>Completá solo lo que sabés. La ficha puede quedar incompleta mientras coordinás la atención.</p>
      <label>Nombre del paciente<input name="patientGivenName" autoComplete="off"/></label>
      <label>Apellido del paciente<input name="patientFamilyName" autoComplete="off"/></label>
      <label>Teléfono propio del paciente · opcional<input name="patientPhone" type="tel" autoComplete="off"/></label>
      <label>Domicilio · opcional<input name="patientAddress" autoComplete="off"/></label>
      <label>Identificador de ficha existente · opcional<input name="patientId" autoComplete="off" aria-describedby="patient-id-help"/></label>
      <p>En las pruebas usá nombres inventados. Teléfono y domicilio son opcionales.</p>
      <small id="patient-id-help">Dejalo vacío para crear una ficha nueva. No ingreses datos del contacto en los campos del paciente.</small>
    </section>
    <section className="clinical-module" aria-labelledby="contact-heading">
      <h2 id="contact-heading">Persona que se comunica</h2>
      <label>Nombre y apellido<input name="contactName" required autoComplete="name"/></label>
      <label>Relación con el paciente<input name="relationship" required placeholder="Por ejemplo, paciente, hija, tutor"/></label>
      <label>Teléfono de contacto<input name="contactPhone" type="tel" autoComplete="tel"/></label>
      <label><input type="checkbox" name="contactIsPatient" value="true" defaultChecked/> Quien se comunica es el paciente</label>
      <fieldset><legend>Funciones en esta consulta</legend>
        <label><input type="checkbox" name="roles" value="requester" defaultChecked/> Inició la consulta</label>
        <label><input type="checkbox" name="roles" value="coordination-contact" defaultChecked/> Coordina horarios</label>
        <label><input type="checkbox" name="roles" value="budget-acceptor"/> Puede responder el presupuesto</label>
        <label><input type="checkbox" name="roles" value="legal-representative"/> Representante legal habilitado</label>
      </fieldset>
      <label>Fundamento de representación · si aplica<textarea name="representationBasis" rows={2} maxLength={500}/></label>
    </section>
    <section className="clinical-module" aria-labelledby="privacy-heading">
      <h2 id="privacy-heading">Información sobre los datos</h2>
      <ConsultationPrivacyNote/>
      <label><input type="checkbox" name="dataNoticeRequesterGiven" value="true" required/> Confirmo que informé a quien se comunica sobre el tratamiento de sus datos antes de registrarlos.</label>
      <label><input type="checkbox" name="dataNoticePatientGiven" value="true"/> Si el paciente es otra persona y cargué sus datos, confirmo que también recibió el aviso.</label>
      <p>El consentimiento clínico se registrará por separado cuando corresponda. Ser contacto o aceptar un presupuesto no acredita representación ni autorización para recibir información clínica.</p>
    </section>
    <section className="clinical-module"><h2>Información referida · opcional</h2><label>Motivo inicial<textarea name="initialReason" maxLength={2000} rows={3}/></label><label>Quién lo refiere<select name="initialSource" defaultValue=""><option value="">Elegí la fuente si registrás un motivo</option><option value="patient">Paciente</option><option value="family">Familiar</option><option value="professional">Profesional</option></select></label></section>
    <label>Próximo contacto acordado<input name="nextFollowUpAt" type="datetime-local" required/></label>
    {state.error ? <p className="form-error" role="alert">{state.error}</p> : null}
    <div className="form-actions"><Link className="button-link" href="/inicio">Cancelar</Link><button className="submit-button" disabled={pending}>{pending ? "Guardando…" : "Registrar consulta"}</button></div>
  </form>;
}
