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
- bloqueo de indexación para toda la aplicación;
- pruebas unitarias iniciales;
- documentación de producto, arquitectura y privacidad.

Todavía no están implementados autenticación, pacientes, visitas, PWA, sincronización offline ni generación de informes. El `/admin` anterior continúa siendo el respaldo operativo durante la migración.

## Desarrollo local

```bash
npm install
cp .env.example .env.local
npm run dev
```

La pantalla inicial estará disponible en `http://localhost:3000`. `GET /api/health` comprueba la disponibilidad de HAPI FHIR sin revelar su URL.

Requiere Node.js 20.19 o superior.

## Verificación

```bash
npm run lint
npm run test
FHIR_BASE_URL=http://localhost:8081/fhir npm run build
```

## Documentación

El índice está en [`docs/README.md`](./docs/README.md).
