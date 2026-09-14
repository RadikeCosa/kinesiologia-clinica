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
  treatment/

src/application/
  patients/
    patient.repository.ts
    list-active-patients.ts
  treatments/
    treatment.repository.ts

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
- modo de captura (`live` o `retrospective`) y hora de registro en extensiones locales `encounter-capture-mode-v1` y `encounter-recorded-at-v1`;
- métricas funcionales opcionales en `Observation`, con ID estable por visita y tipo de métrica;
- relectura desde HAPI de la visita y las métricas antes de mostrar confirmación.

El formulario permite iniciar y finalizar en el momento o cargar horarios retrospectivos. La acción y las rutas clínicas están limitadas al entorno local ficticio `8081` y exigen una sesión vigente. El piloto no ofrece borradores ni acceso a datos reales.

La prueba `clinical-visit.fhir.integration.test.ts` escribe solo datos ficticios en `8081`, repite una visita y verifica que se conserva un único `Encounter` y una única métrica.

## Alcance pendiente antes de retirar `/admin`

Para completar el adaptador mínimo previo a podar `/admin` todavía faltan:

1. autenticación, sesiones y revocación en teléfono y computadora;
2. borradores, PWA, sincronización offline y resolución de conflictos;
3. edición controlada de visitas confirmadas y compatibilidad con datos anteriores;
4. resúmenes, informes y funciones administrativas necesarias para el corte;
5. validación de dispositivo, infraestructura privada, backup y reversión.

`ServiceRequest`, `Practitioner` y `DocumentReference` pertenecen a etapas posteriores de la V1.
