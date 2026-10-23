"use client";

import { createContext, useContext } from "react";
const PilotContext = createContext(false);
export function ClinicalEnvironmentProvider({ pilot, children }: { pilot: boolean; children: React.ReactNode }) {
  return <PilotContext.Provider value={pilot}>{children}</PilotContext.Provider>;
}
export function ClinicalEnvironmentLabel() {
  return <>{useContext(PilotContext) ? "Piloto privado · Registro complementario" : "Entorno local · Datos ficticios"}</>;
}
export function ConsultationPrivacyNote() {
  const pilot = useContext(PilotContext);
  return <p>Antes de registrar la consulta, informá la finalidad, el responsable, quiénes pueden recibir los datos y los derechos de la persona titular. {pilot ? "Registrá únicamente las constancias que efectivamente ocurrieron. Usá alias y omití datos identificatorios." : "El aviso aplicable para la práctica aún debe ser aprobado y configurado; esta pantalla funciona solo con datos ficticios."}</p>;
}
