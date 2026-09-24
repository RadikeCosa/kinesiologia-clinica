# Kinesiología Clínica

Aplicación privada para organizar pacientes, tratamientos y visitas de kinesiología domiciliaria. Esta etapa reemplaza de forma incremental la superficie `/admin` y está pensada para un profesional independiente.

> Registrar una vez. Comunicar y reportar sin volver a escribir.

## Estado del proyecto

La aplicación cuenta con una pantalla de inicio autenticada con **Hoy**, **Agenda** y **Pacientes**; administración de pacientes y tratamientos; agenda de visitas; registro de visitas en vivo o de forma diferida; evaluaciones funcionales y procedimientos; y corrección o anulación justificada de visitas. Los datos clínicos se guardan en HAPI FHIR desde el servidor, nunca directamente desde el navegador.

El acceso usa passkeys para una cuenta profesional provisionada, con sesiones por dispositivo, revocación y códigos de recuperación. El ingreso y registro con passkey se validaron en computadora; siguen pendientes la validación completa en móvil, recuperación y revocación.

**Todos los datos usados actualmente en desarrollo, pruebas, demostraciones y documentación son inventados. No cargar datos reales.** El flujo clínico es un piloto online que solo se habilita localmente contra el HAPI descartable en `http://localhost:8081/fhir`; las rutas y escrituras clínicas están bloqueadas en Vercel. El antiguo `/admin` sigue siendo el respaldo operativo durante la migración.

Todavía no están implementados PWA, trabajo offline, sincronización posterior ni informes exportables. El proyecto no está listo para datos clínicos reales.

## Recorrido de la aplicación

La pantalla **Hoy** reúne las visitas en curso, pendientes y previstas. **Agenda** permite consultar fechas y resolver visitas. **Pacientes** permite buscar y abrir fichas, donde se consulta el tratamiento y el historial. Desde una ficha se registra una visita con horarios, evolución breve, intervención y próximo paso; evaluaciones y procedimientos son opcionales.

En la interfaz, *visita* es el término principal. *Sesión* puede aparecer en resúmenes, e *intervención* describe el trabajo hecho dentro de una visita.

## Imágenes

Las capturas deben tomarse de la aplicación ejecutándose con su conjunto ficticio de demostración. No se incluyen imágenes en este README hasta disponer de capturas reales de la interfaz.

## Desarrollo local

Requiere Node.js 20.19 o superior y el HAPI FHIR descartable descrito en [`docs/local-fhir.md`](./docs/local-fhir.md).

```bash
npm install
cp -n .env.example .env.local
npm run dev
```

La aplicación queda disponible en `http://localhost:3000/inicio`. `GET /api/health` informa la disponibilidad del registro clínico sin revelar su URL ni datos sensibles.

Para cargar datos ficticios repetibles:

```bash
npm run seed:clinical-home
```

`npm run dev` apunta al HAPI descartable de `8081`. No uses `npm run dev:fhir-real` durante desarrollo o pruebas. Para acceder desde Android por HTTPS en la misma red, seguí [`docs/dev-lan.md`](./docs/dev-lan.md).

Para preparar una cuenta local, configurá las variables de `.env.example` en `.env.local`, generá un valor aleatorio para `AUTH_BOOTSTRAP_TOKEN` y registrá la primera passkey en `/ingresar`. Guardá los códigos de recuperación que se muestran una sola vez. La guía de dispositivos está en `/configuracion/dispositivos`.

## Comprobaciones

```bash
npm run lint
npm run test
npm run test:integration:fhir
npm run test:e2e
FHIR_BASE_URL=http://localhost:8081/fhir npm run build
```

## Documentación

- [Producto y alcance](./docs/product.md)
- [Arquitectura](./docs/architecture.md)
- [Privacidad y entornos](./docs/privacy.md)
- [Adaptador FHIR](./docs/fhir-adapter.md)
- [Índice de documentación](./docs/README.md)
