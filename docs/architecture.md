# Arquitectura

## Estado

Este repositorio es el reemplazo privado de `/admin`. El frontend se construye desde cero y el admin anterior sigue siendo el respaldo operativo hasta alcanzar las condiciones de corte.

La fundación inicial contiene una pantalla no clínica, bloqueo de indexación, pruebas unitarias y un chequeo server-side de disponibilidad FHIR. Todavía no implementa autenticación, pacientes, visitas, PWA, offline ni informes.

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

## Evolución prevista

1. autenticación y dispositivo confiable;
2. dominio mínimo de paciente, tratamiento y visita;
3. adaptadores FHIR compatibles con datos existentes;
4. primer corte vertical online;
5. PWA, borradores offline e idempotencia;
6. seguimiento longitudinal y reportes;
7. retiro de `/admin` del repositorio público después de validar reversión.
