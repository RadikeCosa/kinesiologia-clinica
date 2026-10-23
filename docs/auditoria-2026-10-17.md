# Auditoría de últimos cambios y punto de partida

**Fecha:** 2026-10-17.
**Referencia Git:** `8bba07b6065eaee0008a753c5d360b6f45472dc8`.
**Alcance:** revisión funcional y técnica del incremento local de consultas y su conexión con agenda, pacientes, tratamientos y evaluación inicial; regresión automatizada del núcleo existente. Al comenzar había 28 archivos modificados y 19 archivos nuevos sin seguimiento. La revisión incluye esos archivos nuevos, que `git diff --stat` no cuenta.

## Diagnóstico

El núcleo online conserva una base automatizada aprobada. El incremento permite gestionar consulta, presupuesto, cita de evaluación, evaluación inicial y transición a tratamiento con primer período. La persistencia de las operaciones compuestas y parte de la concurrencia están probadas contra HAPI ficticio.

El punto de partida es **estabilización del ingreso y su integración con la operación diaria**. Las pantallas nuevas permiten avanzar mientras se conserva su URL, pero el recorrido todavía presenta huecos de navegación, agenda, continuidad clínica y gestión de autorizaciones. Las suites actuales pasan sin cubrir esos huecos. No corresponde considerar cerrado el incremento ni habilitar datos reales con esta evidencia.

## Comprobaciones de esta auditoría

| Comprobación | Resultado | Límite |
|---|---|---|
| `npm run lint` | Aprobado | Análisis estático |
| `npm run test` | 139 aprobadas; 24 omitidas | Las 24 omitidas son integración y se ejecutaron por separado |
| `npm run test:integration:fhir` | 24/24, seis archivos | Solo `localhost:8081/fhir` |
| `FHIR_BASE_URL=http://localhost:8081/fhir npm run build` | Aprobado | Webpack; compilación y TypeScript completados |
| `npm run test:e2e -- --project=desktop-chrome` | 17/17 | Chrome de escritorio; sin aceptación física ni emulación móvil en esta corrida |
| Reproducciones focales adicionales | 3/3 confirman comportamiento defectuoso | Dos superposiciones entre pacientes y rechazo de revocación después del ingreso |
| `git diff --check` | Aprobado | Cambios rastreados |

La primera corrida FHIR falló porque el entorno restringido impedía conectarse al puerto local (`EPERM`). La repetición con acceso local autorizado pasó 24/24. Ese primer resultado no se atribuye a un defecto de producto. Las reproducciones focales se ejecutaron con repositorios en memoria en archivos temporales, retirados después; no amplían la suite permanente ni su conteo de 139.

Integración y E2E escribieron y limpiaron fixtures ficticios mediante sus mecanismos existentes. No se consultaron HAPI 8080, secretos ni datos clínicos reales. No se cambió código de producto para esta auditoría. No es una auditoría exhaustiva de seguridad, infraestructura o cumplimiento legal.

## Hallazgos priorizados

### 1. P1 — El control global de horarios omite evaluaciones de otros pacientes

**Evidencia:** `src/application/schedule/manage-scheduled-visits.ts:71` filtra las evaluaciones por el paciente de la nueva visita. `src/application/consultations/manage-consultations.ts:68` aplica el mismo filtro entre evaluaciones.

**Reproducción:** una evaluación confirmada de B de 10 a 11 permite guardar una visita de tratamiento de A a la misma hora con `acknowledgeConflict: false`. También permite coordinar otra evaluación para A en ese horario, incluso ejecutando el caso de uso dentro del coordinador de agenda. Ambas reproducciones pasaron afirmando ese comportamiento actual.

**Impacto:** un profesional único puede quedar reservado para dos pacientes sin advertencia. Serializar escrituras no resuelve el problema si la comprobación excluye citas que deberían competir por el mismo horario. Las pruebas actuales de cruce con evaluación usan el mismo paciente.

**Cierre esperado:** comprobar ocupación del profesional entre todos los pacientes y ambos tipos de cita; probar creación y reprogramación, incluyendo concurrencia. Conservar la política explícita de confirmación de superposición donde el producto la admita.

### 2. P1 — La consulta no tiene una vía de regreso desde Inicio o la ficha

**Evidencia:** fuera de las propias rutas de consulta, el enlace incorporado en `src/app/inicio/clinical-home.tsx:89` abre únicamente `/consultas/nueva`. Inicio y la ficha no consumen `activeConsultationId` para mostrar un acceso al ingreso. El puerto `listByPatientId` existe, pero no se usa allí para presentar el historial de consultas.

**Escenario:** crear consulta, volver a Inicio y abrir la ficha. No hay una acción visible para retomar presupuestos o evaluación. La ficha ofrece comenzar tratamiento, pero `beginTreatment` rechaza esa operación si existe una consulta activa. La información persiste; el acceso depende de conservar la URL o del historial del navegador.

**Cierre esperado:** acceso a consulta activa e historial desde la ficha; pendientes de consulta y seguimientos recuperables desde Inicio. Una recarga o nueva sesión debe permitir continuar sin conocer identificadores ni URLs. La ficha debe orientar al ingreso cuando el tratamiento directo está bloqueado.

### 3. P1 — Las citas de evaluación quedan fuera de Hoy y la agenda principal

**Evidencia:** `src/application/home/get-clinical-home.ts` construye la agenda con `scheduledVisits`. Su mapper (`src/infrastructure/fhir/appointment/appointment.mapper.ts:67`) descarta citas sin referencia a `EpisodeOfCare`. Las nuevas evaluaciones se guardan con referencia a `ServiceRequest` y todavía no tienen tratamiento.

**Impacto:** una cita confirmada en la consulta puede ocupar horario y no aparecer en las superficies diarias del profesional. Las propuestas sin hora también quedan fuera de esa agenda.

**Cierre esperado:** incorporar evaluaciones confirmadas y propuestas a Hoy/Agenda, con identificación de su tipo y navegación a la consulta; conservar reprogramaciones, cancelaciones y realización. No asignar un tratamiento ficticio para conseguir que el mapper las acepte.

### 4. P1 — Iniciar tratamiento bloquea la revocación de autorizaciones previas

**Evidencia:** `revokeThirdPartyDisclosure`, en `src/application/consultations/manage-consultations.ts:439`, exige una consulta activa. El estado `treatment-started` queda excluido. La página también oculta el formulario cuando la consulta deja de estar activa. `persistWithLock` exige además que siga disponible el puntero de consulta activa, que se libera al iniciar tratamiento.

**Reproducción:** una autorización válida del paciente registrada durante el ingreso no admite revocación después de pasar a `treatment-started`, aunque conserva actor y destinatario. La prueba focal confirmó el rechazo antes de guardar.

**Impacto:** el historial puede seguir presentando una autorización vigente durante el tratamiento sin permitir registrar que fue revocada. El cierre administrativo de la consulta tiene el mismo problema.

**Cierre esperado:** separar el ciclo de autorizaciones del ciclo de consulta; permitir revocación trazable durante tratamiento y después del cierre. El cambio necesita adaptar persistencia y control de versión, además de la condición visual. No implica automatizar comunicaciones externas.

### 5. P1 — La evaluación inicial no tiene continuidad clínica completa

**Evidencia:** la consulta permite cargar `ClinicalVisitFields` y guarda observaciones/procedimientos, pero su sección «Evaluación registrada» muestra solo la narrativa. En `src/app/patients/[id]/page.tsx:26-35`, las series clínicas se restringen a visitas finalizadas del tratamiento; el Encounter inicial no tiene ese tratamiento y queda excluido. Los flujos existentes de corrección/anulación usan `prepareVisitPeriod`, que exige un tratamiento y un período: no constituyen un flujo válido para esta evaluación independiente.

**Impacto:** mediciones iniciales guardadas no se muestran en la revisión de la consulta ni en las series de la ficha. Tampoco hay un recorrido específico completo para corregir/anular el registro y reflejar sus efectos en el ingreso. El documento de preparación ya reconoce parte de este pendiente.

**Cierre esperado:** recuperar narrativa y registros estructurados; mostrar la evaluación como antecedente separado de las visitas del período, sin consumir cupo. Diseñar corrección/anulación aditiva con revisión concurrente y decidir qué sucede si ya originó un tratamiento.

## Estado por capacidad

| Capacidad | Punto de partida |
|---|---|
| Visitas, tratamientos, períodos, informes y PDF existentes | Regresión técnica aprobada; se conserva pendiente la aceptación física documentada |
| Consulta y presupuesto | Implementados con versiones y controles; navegación y recuperación cotidiana incompletas |
| Evaluación inicial y transición a tratamiento | Persistencia compuesta probada; presentación, continuidad y correcciones incompletas |
| Agenda compartida | Coordinador versionado probado; corregir alcance de superposiciones e incluir evaluaciones en la agenda visible |
| Autorizaciones a terceros | Alta y revocación durante consulta abierta probadas; falta ciclo posterior al ingreso |
| Autenticación | Se conserva el estado documentado; esta corrida E2E usa sesión de prueba y no acredita WebAuthn físico ni recuperación |
| Uso con datos reales | No acreditado; siguen abiertos los requisitos operativos y las decisiones de privacidad de la matriz existente |
| PWA/offline | Sin implementación; no es el próximo incremento recomendado |

## Próximos pasos y criterios de salida

1. **Estabilizar agenda:** corregir el alcance del conflicto y añadir pruebas permanentes entre pacientes distintos. Incluir citas de evaluación en Hoy/Agenda. Salida: todas las citas visibles y cada superposición detectada conforme a la política del producto, también ante dos dispositivos.
2. **Cerrar navegación del ingreso:** consulta activa e historial accesibles desde la ficha, seguimientos visibles desde Inicio y acciones coherentes con el estado. Salida: crear, salir, volver a ingresar y continuar sin URL guardada.
3. **Cerrar continuidad clínica y autorizaciones:** recuperar mediciones iniciales, definir correcciones/anulaciones y permitir revocación después de iniciar tratamiento. Salida: evaluación consultable/corregible y autorización revocable durante toda su vigencia, con historial y control de concurrencia.
4. **Añadir el recorrido E2E completo:** consulta → presupuesto de evaluación aceptado → cita → evaluación realizada con medición → presupuesto de tratamiento aceptado → consentimiento → tratamiento/período → regreso a ficha. Incluir vuelta desde Inicio, sesión nueva y reintentos. El E2E actual de consultas cubre alta, autorización/revocación, seguimiento y cierre; no recorre esa conversión completa.
5. **Aceptar físicamente y cerrar operación:** recorrido en Ubuntu/Moto G15; pruebas pendientes de informes, segundo autenticador y recuperación cuando se disponga del dispositivo necesario; entorno privado, coordinador aprovisionado, respaldo/restauración y contingencia. Contrastar con `preparacion-uso-real.md` y `pruebas-fisicas-periodos.md`. Esta auditoría no revalida las interpretaciones legales de esos documentos.
6. **Consolidar un checkpoint revisable:** una vez corregidos los bloqueos, versionar el incremento con sus archivos nuevos y evidencia actualizada. Los cambios locales actuales aún no forman un punto de restauración Git. Mantener solo fixtures ficticios y documentación apta para el repositorio.

## Documentación que debe reconciliarse al cerrar el incremento

`audit-estado-actual.md` conserva una actualización del 15/10 que dice que agenda/evaluación sin tratamiento no están implementadas y que no fue posible validar HAPI. `preparacion-uso-real.md` y las pruebas actuales evidencian implementación e integración posterior. No usar esa cabecera histórica como fotografía vigente; conservar su evidencia histórica y enlazar este diagnóstico. Los conteos de esta auditoría corresponden al árbol local descrito, no a futuras modificaciones.
