# Arquitectura

## Estado

Este repositorio es el reemplazo privado de `/admin`. El frontend se construye desde cero y el admin anterior sigue siendo el respaldo operativo hasta alcanzar las condiciones de corte.

La fundación contiene una pantalla no clínica, bloqueo de indexación, pruebas, un chequeo server-side de disponibilidad FHIR y un piloto clínico online: pacientes activos, contexto, visitas finalizadas y métricas opcionales. Las rutas y la escritura se habilitan exclusivamente contra el HAPI descartable de `8081` y se bloquean en Vercel. El acceso con passkeys, sesiones persistentes, revocación y recuperación está implementado, pendiente de validar con credenciales reales en ambos dispositivos. También existe un laboratorio autenticado y exclusivo de desarrollo para revisar la futura pantalla inicial con datos ficticios en memoria. Todavía no implementa PWA, offline ni informes.

## Capas

```text
src/app              interfaz y endpoints del framework
       ↓
src/application      casos de uso y puertos
       ↓
src/domain           lenguaje, reglas y estados clínicos
       ↑
src/infrastructure   adaptadores externos, incluido FHIR
```

Reglas de dependencia:

- la UI utiliza casos de uso, no recursos FHIR;
- `domain` no depende de Next.js, red ni persistencia;
- `application` define los puertos que necesita;
- `infrastructure` implementa esos puertos;
- HAPI FHIR solo se consulta desde código server-side;
- `FHIR_BASE_URL` nunca utiliza el prefijo `NEXT_PUBLIC_`.

## Laboratorio de la pantalla inicial

`/laboratorio/inicio` permite revisar las decisiones de interfaz antes de conectarlas a contratos clínicos. Presenta `Hoy` como vista predeterminada y un directorio completo en `Pacientes`. Los escenarios, pacientes y visitas son modelos de vista ficticios; el presentador puro deriva el orden y los estados visibles a partir de una hora fija. Las interacciones solo modifican el escenario en memoria.

La ruta exige autenticación, `NODE_ENV=development` y el endpoint descartable `http://localhost:8081/fhir`. Aunque comprueba ese entorno seguro, no consulta ni modifica HAPI. En producción, Vercel o el entorno local-real responde como una ruta inexistente. Esta frontera permite evaluar la navegación y los estados sin convertir el laboratorio en un segundo flujo clínico.

## Estado de salud inicial

`GET /api/health` comprueba el `CapabilityStatement` de HAPI FHIR mediante `GET /metadata`.

La respuesta pública del endpoint solo indica:

- disponibilidad de la aplicación;
- estado `available`, `unavailable` o `not_configured` del registro clínico;
- momento de la comprobación.

No expone la URL FHIR, payloads clínicos ni detalles internos del error.

La infraestructura Docker vive fuera de este repositorio. Su operación segura está documentada en `docs/local-fhir.md`.

## Primer corte vertical

El siguiente hito funcional será:

```text
Ingresar
  -> ver pacientes activos
  -> abrir contexto mínimo
  -> registrar una visita
  -> confirmar en HAPI FHIR
  -> volver a leer la visita confirmada
```

Se portarán reglas y pruebas de forma selectiva desde el proyecto anterior. No se copiarán layouts, formularios ni componentes de `/admin` como base visual.

El primer tramo resuelve `EpisodeOfCare` activos, carga sus `Patient` relacionados y compone un modelo de aplicación propio. El piloto siguiente lee el contexto de tratamiento, registra visitas finalizadas con identidad estable y vuelve a leer cada escritura confirmada. Falta validar la experiencia desde el teléfono y proteger el acceso antes de cualquier dato real. El contrato detallado está en `docs/fhir-adapter.md`.

## Evolución prevista

1. autenticación y dispositivo confiable;
2. dominio mínimo de paciente, tratamiento y visita;
3. adaptadores FHIR compatibles con datos existentes;
4. primer corte vertical online;
5. PWA, borradores offline e idempotencia;
6. seguimiento longitudinal y reportes;
7. retiro de `/admin` del repositorio público después de validar reversión.
