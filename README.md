# Kinesiología Clínica

Aplicación privada para registrar visitas y seguir la evolución de tratamientos de kinesiología domiciliaria.

## Propósito

La aplicación está pensada para un profesional independiente que trabaja principalmente desde el teléfono durante atención domiciliaria.

> Registrar una vez. Comunicar y reportar sin volver a escribir.

Sus prioridades son registrar visitas con baja fricción, organizar pacientes activos y reutilizar la información clínica para resúmenes e informes.

## Estado actual

Fundación técnica inicial:

- Next.js 16, React 19 y TypeScript;
- separación entre UI, aplicación, dominio e infraestructura;
- integración FHIR exclusivamente server-side;
- endpoint de salud sin exposición de datos sensibles;
- núcleo FHIR inyectable, paginación y errores sanitizados;
- lectura de `Patient` y tratamientos activos con `EpisodeOfCare`;
- caso de uso probado para listar pacientes activos;
- lista clínica local de solo lectura contra el seed ficticio de `8081`;
- contexto de tratamiento y diagnósticos, historial y registro online de visitas finalizadas en el entorno ficticio de `8081`;
- reintentos de visita con identidad estable, métricas funcionales opcionales y relectura de confirmación desde HAPI;
- diagnóstico no clínico de compatibilidad WebAuthn por dispositivo;
- acceso con passkeys para una cuenta profesional provisionada, sesiones por dispositivo, revocación y recuperación con códigos de un solo uso;
- bloqueo de indexación para toda la aplicación;
- pruebas unitarias iniciales;
- documentación de producto, arquitectura y privacidad.

El acceso con passkeys ya protege las páginas clínicas y la acción de visita, pero falta probar el registro, ingreso, recuperación y revocación con credenciales reales en teléfono y computadora. Todavía no están implementados PWA, sincronización offline ni informes. El flujo clínico actual es un piloto online con datos ficticios: solo se habilita localmente contra el endpoint descartable de `8081`; Vercel no expone esas rutas ni permite la acción de escritura. El `/admin` anterior continúa siendo el respaldo operativo durante la migración.

## Desarrollo local

```bash
npm install
cp -n .env.example .env.local
npm run dev
```

La pantalla inicial estará disponible en `http://localhost:3000`. `GET /api/health` comprueba la disponibilidad de HAPI FHIR sin revelar su URL.

Requiere Node.js 20.19 o superior.

`npm run dev` usa el HAPI descartable de `8081`. El acceso a datos reales locales requiere la selección explícita `npm run dev:fhir-real` y no debe utilizarse durante desarrollo o pruebas.

Para preparar una cuenta local, agregá las variables de `.env.example` a tu `.env.local` si ya existía. Generá un código inicial aleatorio con `openssl rand -hex 32` y guardalo en `AUTH_BOOTSTRAP_TOKEN` dentro de `.env.local`. Ese archivo no se versiona. Abrí `/ingresar` y registrá la primera passkey. Guardá los diez códigos de recuperación que se muestran una sola vez. Desde `/configuracion/dispositivos` podés agregar otra passkey, cerrar sesiones o revocar una credencial. La recuperación invalida todas las passkeys y sesiones anteriores y entrega nuevos códigos. `AUTH_ORIGIN` debe coincidir exactamente con la dirección que abre el navegador; para uso fuera de localhost se requiere HTTPS y un `AUTH_DB_PATH` absoluto y persistente.

## Verificación

```bash
npm run lint
npm run test
npm run test:integration:fhir
FHIR_BASE_URL=http://localhost:8081/fhir npm run build
```

## Documentación

El índice está en [`docs/README.md`](./docs/README.md).
