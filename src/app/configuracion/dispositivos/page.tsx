import Link from "next/link";
import { requireClinicalSession } from "@/infrastructure/auth/auth-http";
import { PasskeyAccess } from "../../ingresar/passkey-access";
import { DevicesPanel } from "./devices-panel";

export const dynamic = "force-dynamic";

export default async function DevicesPage() {
  await requireClinicalSession();
  return <main className="shell clinical-shell">
    <Link className="back-link" href="/patients">Volver a pacientes</Link>
    <p className="eyebrow">Acceso privado</p>
    <h1>Dispositivos y passkeys</h1>
    <p className="lede">Cada navegador autorizado tiene una sesión propia. Si perdés un dispositivo, revocá su sesión y la passkey correspondiente.</p>
    <DevicesPanel />
    <PasskeyAccess mode="register" />
  </main>;
}
