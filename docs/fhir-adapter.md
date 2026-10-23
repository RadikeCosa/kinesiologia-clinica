# Adaptador FHIR

## Propósito

El adaptador traduce entre el dominio de la aplicación y HAPI FHIR R4. FHIR es una representación de persistencia; no es el modelo utilizado por la UI.

La implementación toma como referencia el proyecto anterior y conserva sus contratos compatibles, pero elimina el cliente singleton, los imports desde `/admin` y las dependencias hacia helpers visuales.

## Flujo

```text
UI
  -> caso de uso
  -> puerto de aplicación
  -> repositorio FHIR
  -> mapper
  -> cliente HTTP inyectado
  -> HAPI FHIR R4
```

En la lectura, el repositorio devuelve modelos del dominio. Ningún recurso FHIR atraviesa la frontera hacia la UI.

## Estructura implementada

```text
src/domain/
  patient/
  schedule/
  treatment/
  visit/

src/application/
  patients/
    patient.repository.ts
    list-active-patients.ts
  treatments/
    treatment.repository.ts
  schedule/
  visits/

src/infrastructure/fhir/
  core/
    fhir.client.ts
    fhir.errors.ts
    fhir.bundle.ts
    fhir.references.ts
    fhir.search.ts
    fhir.types.ts
  patient/
    patient.fhir.ts
    patient.mapper.ts
    fhir-patient.repository.ts
  episode-of-care/
    episode-of-care.fhir.ts
    episode-of-care.mapper.ts
    fhir-treatment.repository.ts
  appointment/
  encounter/
  observation/
  procedure/
```

## Cliente

`createFhirClient` recibe explícitamente:

- `baseUrl`;
- implementación de `fetch` sustituible;
- timeout opcional.

No existe un singleton global. La composición server-side crea una instancia y la entrega a los repositorios.

El cliente:

- utiliza media type `application/fhir+json`;
- deshabilita cache HTTP de aplicación;
- aplica timeout;
- distingue errores HTTP, red y timeout;
- no conserva bodies ni diagnósticos clínicos en errores;
- rechaza URLs fuera del endpoint FHIR configurado.

## Lectura de pacientes activos

La definición vigente es:

> Paciente activo es quien tiene al menos un `EpisodeOfCare` con estado `active`.

El caso de uso:

1. consulta tratamientos activos;
2. extrae los identificadores de paciente;
3. busca únicamente esos `Patient`;
4. agrupa tratamientos por paciente;
5. selecciona el tratamiento de inicio más reciente si encuentra una inconsistencia con múltiples activos;
6. expone esa inconsistencia mediante `dataQuality.multipleActiveTreatments`;
7. devuelve una lista alfabética independiente de FHIR.

No se cargan todos los pacientes para descubrir cuáles están activos.

## Paginación

Las búsquedas siguen el enlace `Bundle.link[relation=next]`, detectan páginas repetidas y tienen un límite defensivo de veinte páginas. Un enlace externo al endpoint configurado es rechazado.

## Coordinación concurrente de agenda

Las altas y reprogramaciones de visitas de tratamiento y de evaluación adquieren una concesión compartida sobre `Schedule/clinical-agenda-coordinator-v1`. El recurso usa control de versión FHIR; cada cita y la nueva versión del coordinador se guardan en una única transacción con `If-Match`. La aplicación vuelve a consultar superposiciones mientras mantiene la concesión. HAPI debe aceptar transacciones condicionales/versionadas para el recurso `Schedule`; el coordinador y su actor `Device` se aprovisionan en cada instancia antes de habilitar agenda. La prueba de carrera valida este contrato en el HAPI ficticio local, no acredita un servidor de producción.

## Pruebas

### Unitarias

Cubren:

- cliente y errores;
- paginación;
- referencias;
- mappers de `Patient` y `EpisodeOfCare`;
- selección de tratamiento;
- composición del listado activo.

### Contrato con HAPI

`npm run test:integration:fhir` solo admite exactamente:

```text
http://localhost:8081/fhir
```

La prueba hace `PUT` idempotente de dos recursos ficticios:

- `Patient/fixture-active-patient`;
- `EpisodeOfCare/fixture-active-treatment`.

Después ejecuta el caso de uso completo y verifica el resultado. Si se proporciona otro endpoint —incluido `8080`— la suite aborta antes de escribir.

## Primer flujo online con datos ficticios

El piloto local agrega:

- contexto longitudinal de `EpisodeOfCare` mediante las extensiones heredadas y diagnósticos referenciados en `Condition`;
- lectura de visitas `Encounter` existentes, incluidas extensiones clínicas y notas legacy;
- escritura de visitas finalizadas mediante `PUT Encounter/visit-{UUID}`; el mismo `clientVisitId` se conserva al reintentar y un contenido distinto con esa identidad produce conflicto;
- modo de captura (`live` o `retrospective`, presentado en la interfaz como carga diferida) y hora de registro en extensiones locales `encounter-capture-mode-v1` y `encounter-recorded-at-v1`;
- métricas funcionales opcionales en `Observation`, con ID estable por visita y tipo de métrica;
- relectura desde HAPI de la visita y las métricas antes de mostrar confirmación.

El formulario permite iniciar y finalizar en vivo o confirmar los horarios efectivos de una visita ya realizada mediante carga diferida. Que el horario acordado haya pasado no define por sí solo el modo de captura. La acción y las rutas clínicas están limitadas al entorno local ficticio `8081` y exigen una sesión vigente. El piloto no ofrece borradores ni acceso a datos reales.

La prueba `clinical-visit.fhir.integration.test.ts` escribe solo datos ficticios en `8081`, repite una visita y verifica que se conserva un único `Encounter` y una única métrica.

## Agenda y visita enlazada

La agenda persiste `ScheduledVisit` como `Appointment` R4:

- `proposed` y `requestedPeriod` para un día sin horario;
- `booked` con `start` y `end` para un horario confirmado;
- paciente como participante aceptado;
- tratamiento en `supportingInformation` con referencia a `EpisodeOfCare`;
- cancelación y ausencia mediante `cancelled` y `noshow`;
- reprogramación mediante extensiones locales que enlazan la cita anterior y la nueva.

Un `Appointment` `proposed` puede enlazarse a una visita iniciada o cargada de forma diferida. La operación lo marca `fulfilled` pero conserva `requestedPeriod`, sin agregar `start` y `end` ficticios; por eso la aplicación omite la puntualidad en ese caso. El inicio se confirma en la interfaz y la actualización de `Appointment` y la creación de `Encounter` ocurren en una misma transacción.

La creación usa `PUT Appointment/appointment-{UUID}`. Reprogramar conserva la cita anterior y se ejecuta en una transacción. Las mutaciones versionadas envían `If-Match`. La visita en vivo crea un `Encounter` `in-progress`, lo enlaza mediante `Encounter.appointment` y marca la cita `fulfilled` en la misma transacción. Finalizar actualiza el mismo `Encounter` y guarda observaciones con identificadores deterministas.

`scheduled-visit-workflow.fhir.integration.test.ts` prueba creación y reintento, reprogramación con ambas citas, inicio y finalización enlazados, indicadores derivados, cancelación y ausencia. El script `npm run seed:clinical-home` prepara ejemplos dinámicos y repetibles solo en `8081`.

## Pacientes y tratamientos

La ficha de un paciente puede existir sin tratamiento. El alta de una ficha desde la pantalla administrativa conserva su contrato de origen; el nuevo flujo de consulta de ingreso crea/vincula `Patient` y `ServiceRequest` juntos. Nombre, apellido, teléfono y dirección se almacenan en elementos estándar de `Patient`; las indicaciones de acceso usan `patient-home-access-instructions-v1`.

El inicio directo de tratamiento crea `EpisodeOfCare` `active`, con `period.start`, frecuencia, cantidad prevista de sesiones, contexto, precauciones y diagnósticos opcionales. Los diagnósticos se persisten como `Condition` y se enlazan desde `EpisodeOfCare.diagnosis`. No se exige `ServiceRequest`: esa administración queda fuera del flujo clínico privado actual.

Pausa, reanudación y finalización actualizan `EpisodeOfCare` con `If-Match`; el cierre agrega `period.end`. El historial estándar `statusHistory` conserva los períodos y la extensión repetible `episodeofcare-status-change-v1` asocia una nota opcional a cada cambio. La operación rechaza un tratamiento que aún tenga `Appointment` abiertos (`booked` o `proposed`).

## Evaluaciones, síntomas y procedimientos

Cada evaluación funcional nueva se persiste como `Observation` final con `subject`, `encounter` y `effectiveDateTime`. Usa la categoría estándar `exam` y conserva el dominio funcional en el CodeSystem local `clinical-evaluation-domain`; nombre, resultado y contexto se guardan en `code`, `value[x]` y elementos estándar. Extensiones locales guardan únicamente identidad de serie, lateralidad, asistencia o dispositivo y condiciones.

Los síntomas informados por el paciente son un tipo de dominio distinto y se persisten como una `Observation` por cada síntoma efectivamente puntuado. Usan categoría `survey`, `subject=Patient`, `encounter=Encounter`, `effectiveDateTime` de la visita y `performer=Patient` para indicar quién reportó el dato. La intensidad es `valueQuantity` con `system=http://unitsofmeasure.org`, `code={score}` y `unit=score`. El modelo no asigna cero por omisión: un síntoma sin puntuación no genera una `Observation`; el valor 0 se conserva como ausencia explícita del síntoma.

El catálogo usa estos códigos de ítem ESAS de LOINC, verificados en el panel oficial `112503-8` ([Edmonton Symptom Assessment System](https://loinc.org/112503-8/panel)):

| Código local | Código LOINC | Etiqueta |
| --- | --- | --- |
| `pain` | `112494-0` | Dolor |
| `tiredness` | `112495-7` | Cansancio |
| `drowsiness` | `112496-5` | Somnolencia |
| `nausea` | `112497-3` | Náuseas |
| `lack-of-appetite` | `112498-1` | Falta de apetito |
| `shortness-of-breath` | `112499-9` | Falta de aire |
| `depression` | `112500-4` | Ánimo bajo |
| `anxiety` | `112501-2` | Ansiedad |

Los síntomas personalizados usan `https://kinesiologiaadomicilio.local/fhir/CodeSystem/clinical-symptom` con código `custom-symptom` y el nombre ingresado en `code.text`. La interfaz usa el catálogo como lista de síntomas, no administra el cuestionario ESAS completo: no crea `QuestionnaireResponse` ni calcula su puntaje total. La identidad longitudinal usa `observation-series-identity-v1`.

La lectura reconoce las observaciones históricas de dolor NRS por sus códigos anteriores (`clinical-evaluation|pain-nrs` y `functional-observations|pain-nrs-0-10`), incluso si su categoría es la anterior. Se proyectan como síntomas para la interfaz y no se reescriben ni reclasifican en FHIR. Las observaciones históricas de TUG, tolerancia de pie y duración de marcha continúan proyectándose como evaluaciones funcionales. Una serie se identifica con `observation-series-identity-v1` y puede reunir resultados de distintas visitas.

Cada familia seleccionada se persiste como un `Procedure` `completed`, con código local, paciente, encuentro y `performedPeriod`. El cierre genera IDs deterministas para `Observation` y `Procedure` y los incluye, junto con `Encounter` y la cita cuando corresponde, en una transacción atómica. Reutilizar una identidad con contenido diferente se trata como conflicto.

Una visita finalizada puede corregirse sin cambiar la identidad del `Encounter`. La operación exige su versión y un motivo, actualiza sus horarios o nota y las entradas clínicas en una transacción, y conserva el momento original de registro. Las evaluaciones modificadas y los síntomas nuevos modificados usan `Observation.status=corrected`; las entradas retiradas usan `entered-in-error`. Las observaciones históricas reconocidas por compatibilidad no se incluyen en esa reescritura. La anulación de una visita registrada por error marca el `Encounter` y sus observaciones y procedimientos vigentes gestionados por la aplicación como `entered-in-error`, restaura la cita si estaba `fulfilled` y los excluye de las lecturas activas. El motivo y la fecha se guardan en extensiones locales del `Encounter`. HAPI conserva las versiones previas de los recursos.

`visit-correction.fhir.integration.test.ts` corrige y anula una visita ficticia en `8081` y comprueba que el resultado corregido puede releerse y que las entradas anuladas dejan de aparecer en las consultas vigentes.

`clinical-visit.fhir.integration.test.ts` guarda dos visitas ficticias con una evaluación repetida y confirma que HAPI las relee como una sola serie longitudinal, sin duplicar recursos al reintentar.

## Alcance pendiente antes de retirar `/admin`

Para completar el adaptador mínimo previo a podar `/admin` todavía faltan:

1. validación completa de recuperación y revocación en teléfono y computadora;
2. borradores, PWA, sincronización offline y resolución interactiva de conflictos;
3. validación de las correcciones con una copia segura de datos anteriores;
4. aceptación física de informes y funciones administrativas adicionales necesarias para el corte;
5. validación de dispositivo, infraestructura privada, backup y reversión.

`Practitioner` permanece postergado. `ServiceRequest` se usa para el episodio de consulta, no como requisito general de interoperabilidad con derivaciones. `DocumentReference`, `CarePlan` y `Binary` ya se utilizan para períodos e informes.

El adaptador de consulta guarda su contrato local en una extensión versionada de `ServiceRequest`. La referencia a la consulta activa se mantiene en una extensión de `Patient`; crear o cambiar el episodio actualiza ambos recursos dentro de una transacción con `If-Match` sobre la versión del paciente. Esta serialización aún requiere aceptación en la instancia HAPI concreta y no debe considerarse verificada porque pase un test unitario.

## Contrato de períodos y emisiones

Ver [periodos-informes.md](periodos-informes.md) para mapeo de CarePlan, pertenencia de Encounter, creación condicional de DocumentReference, archivos Binary, huella sourceFingerprintV1, hashes de integridad y control de versiones. La descarga recibe el identificador del informe y no expone HAPI. Las pruebas `period-report.fhir.integration.test.ts` usan fixtures de identidad propia y los eliminan en una transacción, sin intervenir registros ajenos.
