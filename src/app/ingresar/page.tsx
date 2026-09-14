import Link from "next/link";
import { PasskeyAccess } from "./passkey-access";
import { readAuthConfig } from "@/infrastructure/auth/auth.config";
import { openAuthStore } from "@/infrastructure/auth/auth-store";
import { currentSession } from "@/infrastructure/auth/auth-http";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (await currentSession()) redirect("/patients");
  const config = readAuthConfig();
  const provisioned = config ? openAuthStore(config).listPasskeys().length > 0 : false;
  return <main className="shell clinical-shell">
    <Link className="back-link" href="/">Volver al inicio</Link>
    <p className="eyebrow">Acceso privado</p>
    <h1>{provisioned ? "Ingresar" : "Preparar acceso"}</h1>
    {!config ? <section className="clinical-panel access-panel"><h2>Configuración pendiente</h2><p>El acceso todavía no está configurado en este servidor. Revisá las variables privadas de autenticación.</p></section>
      : !provisioned && !config.bootstrapToken ? <section className="clinical-panel access-panel"><h2>Código inicial pendiente</h2><p>Configurá un código inicial privado para registrar la primera passkey.</p></section>
      : <PasskeyAccess mode={provisioned ? "login" : "bootstrap"} />}
    {provisioned ? <Link className="diagnostic-link" href="/recuperar">Usar un código de recuperación</Link> : null}
  </main>;
}
