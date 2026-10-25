# Arquitectura

## Estado

Este repositorio es el reemplazo privado de `/admin`. El frontend se construye desde cero y el admin anterior sigue siendo el respaldo operativo hasta alcanzar las condiciones de corte.

La fundación contiene bloqueo de indexación, pruebas, un chequeo server-side de disponibilidad FHIR y un piloto clínico online completo para agenda y visita: pacientes, tratamientos, `Appointment`, `Encounter`, evaluaciones `Observation` y procedimientos `Procedure` opcionales. `/inicio` es la entrada autenticada y compone sus vistas desde los repositorios clínicos reales. Las rutas y la escritura usan por defecto el HAPI ficticio de `8081` y se bloquean en Vercel. El piloto `8080` exige modo y aceptación explícitos; sus condiciones permanecen en `docs/piloto-privado.md`. El acceso con passkeys, sesiones persistentes, revocación y recuperación está implementado. Implementa informes de período con PDF y archivos inmutables desde la aplicación; su aceptación física está pendiente. Todavía no implementa PWA ni offline.

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

## Pantalla inicial y agenda real

`/inicio` compone un modelo de vista desde repositorios de pacientes, tratamientos, citas y visitas. La UI no recibe recursos FHIR. `/patients` redirige a su vista Pacientes y las fichas permanecen bajo `/patients/[id]`. El directorio lee también fichas sin `EpisodeOfCare`, proyectadas como `Sin iniciar`.

Las altas y los cambios de tratamiento forman un caso de uso administrativo separado. `Patient` se crea mediante `PUT` idempotente y las altas de `EpisodeOfCare` con sus `Condition` opcionales se escriben en una transacción. Las actualizaciones de `Patient` y `EpisodeOfCare` usan la versión FHIR con `If-Match`. `EpisodeOfCare.statusHistory` guarda los períodos de actividad y pausa; una extensión local repetible conserva la nota opcional de cada transición porque el adaptador no depende de `note[]` para ese dato.

La admisión y reconciliación del período se preparan en aplicación mediante `createClinicalWorkflow`: se lee el período antes de sus visitas, se conserva su versión y se incrementa la revisión clínica. El puerto de persistencia recibe `PreparedVisit`; el adaptador FHIR solo mapea y confirma ese estado. Las escrituras que cambian cita y visita se envían como transacciones FHIR. Las actualizaciones usan la versión leída mediante `If-Match`; una respuesta `412` se traduce en una indicación de recarga. Los identificadores generados por el cliente permiten repetir una operación sin duplicarla. El reloj es inyectable en aplicación y las reglas de día usan `America/Argentina/Buenos_Aires`.

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

La corrección de una visita confirmada reutiliza su `Encounter` y exige versión y motivo. Actualiza el registro y las evaluaciones y procedimientos afectados en una transacción; los retirados pasan a `entered-in-error`. Anular un registro confirmado marca `Encounter`, observaciones y procedimientos vigentes como `entered-in-error` y restaura la cita vinculada a pendiente. Las lecturas clínicas excluyen esos recursos del seguimiento activo; el motivo y la fecha de la operación quedan en extensiones del `Encounter`.

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

## Consulta de ingreso

El dominio de consulta vive en `src/domain/consultation`; sus operaciones y el puerto de persistencia viven en `src/application/consultations`. El adaptador HAPI usa `ServiceRequest` y una extensión local para su contrato. La interfaz accede al caso de uso mediante acciones de servidor autenticadas.

Para serializar altas activas, el adaptador usa la versión de `Patient` como punto de coordinación: actualiza la referencia a consulta y `ServiceRequest` en una transacción con `If-Match`. La prueba concurrente contra HAPI `8081` confirmó una sola consulta activa entre dos clientes; la integración también verificó el inicio transaccional del tratamiento y su período inicial. La evaluación inicial se registra como `Encounter` independiente, sin crear un tratamiento ficticio. La interfaz permite reprogramar, completar y cancelar seguimientos, y cerrar la consulta con sus motivos trazables.

## Períodos e informes

El tratamiento mantiene EpisodeOfCare y cada período tiene su CarePlan propio. Las visitas conservan periodId y los contadores se derivan de ellas. Las escrituras clínicas bloquean el período mediante If-Match; los informes, renovación y finalización comprueban además tratamiento y paciente. DocumentReference conserva la emisión y referencia Binary para PDF y JSON archivado. Todos los contratos, límites y estados se describen en [periodos-informes.md](periodos-informes.md). La descarga autenticada resuelve archivos en el servidor.

## Garantías reforzadas de acceso y capas

Autenticación define sus contratos de configuración, persistencia y autenticador en aplicación; SQLite y WebAuthn los implementan en infraestructura. La verificación criptográfica ocurre fuera de la transacción. Al confirmar, una transacción SQLite inmediata vuelve a comprobar generación de cuenta, vigencia de la solicitud, credencial y contador, o autorización del actor de enrolamiento. Recuperar la cuenta incrementa su generación y revoca credenciales, sesiones y códigos anteriores de forma atómica. Las sesiones requieren una credencial vigente.

Al abrir un almacén existente se agregan columnas `generation` con valor inicial 0 a `professional` y `challenges`, sin reemplazar claves ni sesiones existentes. Es una migración aditiva; las solicitudes vencidas o de generaciones anteriores se rechazan. No exige reprovisionar la cuenta.

El inicio directo, el inicio desde consulta y la reactivación usan la versión de `Patient` leída antes de consultar tratamientos activos. La transacción confirma esa misma versión junto con los recursos clínicos; no refresca la versión para eludir un conflicto. Un reintento de alta debe coincidir también en contenido y diagnósticos.

La página y la descarga de informes comparten `readPeriodReport`. El puerto devuelve un archivo verificado con informe y bytes, y el caso de uso comprueba sus relaciones una sola vez.

Lint comprueba las fronteras de imports de producción, incluidos imports relativos y dinámicos: dominio no depende de capas externas, aplicación no importa infraestructura/Next/UI y componentes cliente no importan adaptadores. Los contratos de vista compartidos viven en aplicación. La política de despliegue vive en infraestructura/runtime.

## Restricción operativa de proceso único

La aplicación se opera con un único proceso Node.js. La exclusión global de una visita en curso utiliza una cola en memoria y está probada para solicitudes simultáneas en ese proceso. No iniciar réplicas ni varios procesos contra la misma cuenta como despliegue admitido. La coordinación persistente entre instancias queda fuera de este incremento; los conflictos de recursos clínicos sí conservan control de versión FHIR.

La carga de historiales completos en Inicio se mantiene como mejora de rendimiento pendiente de medición. Las pruebas automáticas no sustituyen la aceptación física ni habilitan el piloto.
