import Link from "next/link";
import { PasskeyAccess } from "../ingresar/passkey-access";

export default function RecoveryPage() {
  return <main className="shell clinical-shell">
    <Link className="back-link" href="/ingresar">Volver a ingresar</Link>
    <p className="eyebrow">Acceso privado</p>
    <h1>Recuperar acceso</h1>
    <p className="lede">Usá uno de los códigos guardados al registrar la primera passkey. Al recuperar, se cierran las sesiones anteriores.</p>
    <PasskeyAccess mode="recovery" />
  </main>;
}
