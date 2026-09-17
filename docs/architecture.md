# Arquitectura

## Estado

Este repositorio es el reemplazo privado de `/admin`. El frontend se construye desde cero y el admin anterior sigue siendo el respaldo operativo hasta alcanzar las condiciones de corte.

La fundación contiene bloqueo de indexación, pruebas, un chequeo server-side de disponibilidad FHIR y un piloto clínico online completo para agenda y visita: pacientes, tratamientos, `Appointment`, `Encounter`, evaluaciones `Observation` y procedimientos `Procedure` opcionales. `/inicio` es la entrada autenticada y el laboratorio de desarrollo reutiliza sus modelos visuales con datos en memoria. Las rutas y la escritura se habilitan exclusivamente contra el HAPI descartable de `8081` y se bloquean en Vercel. El acceso con passkeys, sesiones persistentes, revocación y recuperación está implementado. Todavía no implementa PWA, offline ni informes.

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

## Pantalla inicial y agenda real

`/inicio` compone un modelo de vista desde repositorios de pacientes, tratamientos, citas y visitas. La UI no recibe recursos FHIR. `/patients` redirige a su vista Pacientes y las fichas permanecen bajo `/patients/[id]`.

Las escrituras que cambian cita y visita se envían como transacciones FHIR. Las actualizaciones usan la versión leída mediante `If-Match`; una respuesta `412` se traduce en una indicación de recarga. Los identificadores generados por el cliente permiten repetir una operación sin duplicarla. El reloj es inyectable en aplicación y las reglas de día usan `America/Argentina/Buenos_Aires`.

## Estado de salud inicial

`GET /api/health` comprueba el `CapabilityStatement` de HAPI FHIR mediante `GET /metadata`.

La respuesta pública del endpoint solo indica:

- disponibilidad de la aplicación;
- estado `available`, `unavailable` o `not_configured` del registro clínico;
- momento de la comprobación.

No expone la URL FHIR, payloads clínicos ni detalles internos del error.

La infraestructura Docker vive fuera de este repositorio. Su operación segura está documentada en `docs/local-fhir.md`.

## Corte vertical implementado

```text
Ingresar
  -> ver Hoy, Agenda o Pacientes
  -> agendar o comenzar una visita
  -> finalizar la evolución
  -> confirmar cita, visita, evaluaciones y procedimientos en HAPI FHIR
```

El cierre de visita construye una única transacción FHIR con todos los recursos asociados. Los identificadores derivados de la visita y de la entrada del cliente hacen seguro el reintento. La UI reutiliza un componente clínico en el flujo en vivo y en la carga diferida; los recursos FHIR continúan aislados en infraestructura.

Se portarán reglas y pruebas de forma selectiva desde el proyecto anterior. No se copiarán layouts, formularios ni componentes de `/admin` como base visual.

El directorio incluye tratamientos `active`, `onhold` y `finished`; solo los activos habilitan agenda y atención. El contrato detallado está en `docs/fhir-adapter.md`.

## Evolución prevista

1. autenticación y dispositivo confiable;
2. dominio mínimo de paciente, tratamiento y visita;
3. adaptadores FHIR compatibles con datos existentes;
4. primer corte vertical online;
5. PWA, borradores offline e idempotencia;
6. seguimiento longitudinal y reportes;
7. retiro de `/admin` del repositorio público después de validar reversión.
