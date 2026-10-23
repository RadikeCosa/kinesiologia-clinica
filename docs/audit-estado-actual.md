# Auditoría del estado actual

**Consolidación (2026-10-23):** las entradas de este documento conservan evidencia histórica. El incremento actual incluye consultas, citas de evaluación y evaluación inicial sin tratamiento, además de acceso a consulta activa desde Inicio y ficha. Los hallazgos de [la auditoría del 17/10](auditoria-2026-10-17.md) no se consideran cerrados por consolidar Git: siguen pendientes, entre otros, los conflictos entre evaluaciones de pacientes diferentes, su inclusión en la agenda principal, la continuidad/corrección de evaluación inicial y la revocación después del cierre o inicio de tratamiento. El estado operativo posterior y sus límites están en [piloto privado](piloto-privado.md); la evidencia de esta consolidación y el flujo acordado, en [flujo de Git](flujo-git.md). El piloto permanece deshabilitado.

**Actualización (2026-10-15):** se inició un flujo de consulta de servicio separado de paciente/tratamiento, con contactos, avisos iniciales, seguimientos y presupuestos por alcance. La matriz y sus pendientes están en `docs/preparacion-uso-real.md`. La consulta usa `ServiceRequest`; la agenda y evaluación inicial sin tratamiento todavía no están implementadas. HAPI `8081` no estaba disponible desde la sesión para verificar su atomicidad o ejecutar pruebas de integración.

**Fecha:** 2026-09-28

**Estado posterior al incremento (2026-09-29):** se implementaron períodos independientes, cupos/reservas derivados, informe editable antes del guardado definitivo, PDF privado, renovación, cierre parcial y reemplazos. El alcance continúa limitado a datos ficticios de HAPI 8081. La aceptación física del incremento nuevo sigue pendiente; los resultados automáticos actualizados están en la sección final. Las entradas previas describen la evolución desde el baseline.

**Actualización de evolución (2026-09-29):** tras la auditoría, se implementó el primer resumen familiar editable para una visita finalizada. Prepara un texto para WhatsApp con evolución, intervención, evaluaciones/mediciones vinculadas a esa visita y próximo paso, evitando repetir una medición estructurada ya incluida en el texto fuente. No guarda el borrador ni modifica la nota. Pasaron 3 pruebas unitarias, escritorio y emulación móvil; la persona confirmó que funciona en el Moto G15.

**Prioridad posterior elegida (2026-09-29, antes del incremento):** informe de evolución de un período, multipropósito para que la familia pueda compartirlo, llevarlo a una consulta médica o eventualmente presentarlo ante una obra social. Los modelos actuales ofrecen notas de visitas, síntomas, evaluaciones, procedimientos, métricas funcionales y estado de visita para armarlo; el código no contiene informes persistidos/exportables ni define las reglas para elegir registros por período, corregir versiones, firmar o conservar el documento. No se calculan conclusiones clínicas automáticamente. Los requisitos particulares de una obra social deberán verificarse para esa entidad. El alta de tratamiento es directa y no requiere `ServiceRequest`; la aplicación anterior `/admin` no forma parte de este repositorio, por lo que su flujo de derivaciones debe contrastarse con la necesidad operativa antes de decidir el retiro.

**Regla funcional aclarada para el informe (2026-09-29, antes del incremento):** debe cubrir las sesiones de cada período/cupo y prepararse como borrador editable al alcanzar el total previsto (ejemplo: 10/10); será multipropósito para familia, consulta médica y eventual obra social. Después de completar el informe, debe ofrecer finalizar el tratamiento o renovar otro período; llegar al cupo no lo finaliza automáticamente. En esa revisión, el contador de la ficha contaba visitas finalizadas asociadas al tratamiento actual frente a `plannedSessionCount`; el modelo todavía no representaba bloques renovables dentro de un mismo tratamiento. El incremento posterior incorpora los períodos y su progreso independiente.

**Actualización de estabilización (2026-09-29):** la persona confirmó que todas las pruebas guiadas que pudo completar pasaron; la única que deja pendiente es usar un autenticador independiente, porque no dispone de uno. `lint`, unitarias (100), integración FHIR (6), E2E (27) y build con Webpack pasaron. Se añadieron pruebas de respuesta perdida y se aclaró visualmente la protección de la última passkey. No se probaron revocación de una segunda passkey ni recuperación completa, pues requieren otra credencial.

**Baseline:** rama `main`, commit `f9845a8`; árbol limpio antes de esta auditoría. En la continuación posterior, para cerrar el build, se cambió el script `build` de `package.json` a `next build --webpack`; el `npm run build` resultante pasó. Los informes de auditoría y plan también se actualizaron con ese resultado.
**Alcance:** código y documentación de `kinesiologia-clinica`; comparación documental y de rutas con `kinesiologiaadomicilio`; lectura de guías no sensibles de HAPI/Casa. Las pruebas escribieron y limpiaron fixtures ficticios únicamente en HAPI `8081`. No se consultaron credenciales, exports, HAPI `8080` ni datos reales.

## Resultado ejecutivo

El núcleo online está implementado con separación entre interfaz, aplicación, dominio y adaptador FHIR. La persona confirma que las pruebas guiadas que pudo completar pasaron; la prueba con autenticador independiente queda diferida. El build configurado ahora usa Webpack y `npm run build` pasa. Este audit **no permite declarar el proyecto listo para datos reales**: falta validar de forma independiente la recuperación y revocación de una segunda passkey, además de completar los requisitos operativos de privacidad y restauración. La etapa 2 del plan (estabilización del núcleo online) quedó cerrada tras limpiar de forma acotada las citas ficticias duplicadas. Turbopack conserva un fallo conocido al procesar CSS en este host, pero ya no es el método elegido para el build.

La corrida posterior al incremento reportó **116 unitarias aprobadas y 16 casos FHIR omitidos en el comando unitario**. Estos últimos se ejecutaron por separado: **16/16 de integración aprobados**. La regresión de navegador aprobó **31/31**. Lint y build de producción con Webpack aprobados. Ninguna comprobación se dirigió al HAPI `8080`. Las cifras anteriores se conservan como evidencia histórica, sin contar omisiones como aprobación.

## Evidencia por capacidad

| Capacidad | Estado en código/documentación | Evidencia de esta auditoría | Pendiente para cerrar |
|---|---|---|---|
| Capas y FHIR server-side | Implementado según arquitectura y rutas inspeccionadas | Acciones usan casos de uso y adaptadores server-side; `FHIR_BASE_URL` no es público; integración FHIR 6/6 y `npm run build` con Webpack pasan | Ninguno en el build seleccionado; Turbopack queda como limitación conocida de este host |
| Pacientes y tratamientos | Implementados; alta de tratamiento no requiere solicitud | Casos de uso y pruebas unitarias existentes | Decidir si la puerta de `ServiceRequest` del admin previo es necesaria para este producto |
| Agenda y visita online | Implementadas: citas, inicio, carga diferida, cierre y métricas opcionales | Pruebas unitarias, integración (6/6) y Playwright (27/27) pasan. Se añadieron simulaciones de respuesta perdida tras escrituras y los reintentos conservaron un único ID. La persona confirma que las pruebas guiadas posibles pasaron. La visita diferida, corrección/anulación, recuperación tras recarga y cierre de pestaña, reprogramación/cancelación y “No se realizó” se probaron con datos ficticios. Las cuatro reservas activas duplicadas del 30/09 se borraron lógicamente con autorización y se verificó que la cita semilla y las canceladas permanecen | El corte real de red durante un guardado no se simula en el dispositivo; solo se valida en pruebas controladas |
| Corrección y anulación | Implementadas con control de versión y motivo | Pruebas de caso de uso e integración; HAPI ficticio leyó/escribió recursos en la suite (6/6) | Sin bloqueo detectado en el alcance probado |
| Evaluaciones longitudinales | Implementadas con series e historial | Mapper y pruebas unitarias; integración verifica que dos visitas releídas permanezcan en una serie; en Ubuntu se comprobó visualmente `demo-rosa` con síntomas y evaluaciones en secciones separadas | Sin bloqueo detectado en el alcance probado |
| Passkeys, sesiones y recuperación | Flujos implementados para una cuenta provisionada | Ingreso nuevo con passkey en Ubuntu y Moto G15; revocación de sesión comprobada; códigos renovados y guardados. La persona confirma que todas las pruebas que pudo completar pasaron. El alta de una segunda passkey no se pudo validar: el autenticador elegido ya contiene la credencial existente (`InvalidStateError`). La persona no dispone de un autenticador independiente y deja esa prueba pendiente. | Cuando haya un autenticador independiente, probar alta y revocación de segunda passkey y recuperación completa. El vencimiento está configurado a 30 días; no se esperó esa ventana ni se identificó prueba automatizada específica |
| UX móvil y accesibilidad | Cobertura automatizada parcial; recorrido guiado completado según la persona | Playwright completo: 27/27; diálogo “Más” incluye contacto, ficha, precauciones y ubicación; pruebas cubren teclado y emulación móvil. La persona confirma que completó las pruebas guiadas posibles, salvo el autenticador independiente | No hay otro pendiente manual inmediato. La prueba con autenticador independiente permanece diferida |
| PWA y operación offline | No implementadas | No se encontraron service worker, almacenamiento local clínico ni sincronización en `src` | Diseñar protección, cola idempotente, conflictos y pérdida/recuperación de conexión antes de construir |
| Resúmenes e informes persistidos | Resumen familiar editable e informes de período definitivos implementados | Resumen confirmado en Moto G15. Períodos, DocumentReference y Binary verificados en HAPI 8081; guardado, PDF, hashes y reemplazos cubiertos por pruebas nuevas detalladas abajo | Recorrido físico del incremento en Ubuntu/Moto; requisitos de destinatarios antes de uso real |
| Privacidad, demo y uso real | Guardas locales y reglas documentadas; no equivale a entorno real listo | Las rutas clínicas comprueban entorno local y sesión; HAPI dev y real usan puertos distintos según documentación | Acreditar HTTPS privado, separación demo/real, logs, backup cifrado/protegido y restauración probada |

## Comprobaciones ejecutadas

- `npm run lint`: **aprobado**.
- `npm run test`: **aprobado con omisiones**: 100 casos pasan, 6 se omiten en 4 archivos de integración porque no había endpoint configurado.
- `npm run test:integration:fhir`: **aprobado**, 4 archivos y 6 casos. El entorno ficticio HAPI de `8081` se inició según su guía y respondió FHIR R4 `4.0.1`.
- `npm run test:e2e`: corrida inicial: **11 aprobados, 7 fallidos y 8 no ejecutados**. Tras actualizar expectativas al comportamiento y a los fixtures actuales, corrida completa: **26 aprobados, 0 fallidos, 0 no ejecutados**. En la continuación se añadió el escenario de passkey única; la suite completa pasó **27/27** (escritorio y emulación Chrome móvil).
- **Reverificación técnica (2026-09-29):** lint aprobado; unitarias: 26 archivos aprobados y 4 omitidos, 100 casos aprobados y 6 omitidos; integración FHIR: 4/4 archivos y 6/6 casos aprobados contra `localhost:8081`; E2E: 27/27 aprobados; build Webpack: aprobado. La primera llamada de integración desde el sandbox no pudo conectar (`EPERM`); al repetirla con acceso local autorizado pasó completa. E2E sembró recursos ficticios conocidos, marca `entered-in-error` Encounter no semilla de seis pacientes ficticios y limpia dos citas aleatorias rastreadas. No borra otras citas de Agenda; el origen de las filas descritas abajo no quedó registrado.
- Antes del ajuste, `FHIR_BASE_URL=http://localhost:8081/fhir npm run build` usaba Turbopack y quedó **bloqueado en este host** al procesar CSS: el proceso de PostCSS intenta abrir un puerto local y el sistema devuelve `Operation not permitted`, incluso con ejecución ampliada.
- `FHIR_BASE_URL=http://localhost:8081/fhir npm run build -- --webpack`: **aprobado** con ejecución ampliada; compilación, TypeScript, rutas y trazas completados.
- Como seguimiento, el script `build` de `package.json` se cambió a `next build --webpack`. El `FHIR_BASE_URL=http://localhost:8081/fhir npm run build` resultante pasó completo, incluida la generación de rutas y recolección de trazas. Sin ejecución ampliada, este host bloquea el proceso hijo de TypeScript (`EPERM`); con ejecución ampliada el build termina correctamente.
- Lint y las pruebas unitarias se repitieron tras los cambios y volvieron a pasar con los conteos actualizados.

La compilación de producción configurada queda validada con Webpack. El fallo de Turbopack en este host no demuestra un defecto del código ni permite descartar uno; queda como limitación conocida, ya que el proyecto selecciona Webpack para que el comando de producción complete.

## Hallazgos y decisiones

1. **E2E alineados y aprobados en emulación.** Los siete fallos iniciales provenían de expectativas E2E desactualizadas respecto a la navegación de calendario, el agrupamiento de acciones, los enlaces, la separación entre síntomas y evaluaciones, y la cita ficticia elegida. No se reprodujo un defecto de producto en esos casos. Tras actualizarlos, 26/26 pasan. La persona confirma que las pruebas guiadas que pudo completar también pasaron; el detalle individual de esos escenarios no quedó asentado.
2. **Integración persistida validada en dev.** Los 6 casos FHIR pasaron contra el servidor ficticio, incluida la cobertura de escritura/relectura prevista por esos contratos. E2E pasó después de alinear los selectores y expectativas con el comportamiento vigente.
3. **La última passkey está protegida; la interfaz ya explica por qué.** `DevicesPanel` deshabilita la revocación cuando queda una sola credencial y `AuthStore.deletePasskey` rechaza eliminarla. Se actualizó el estado visual del botón y se añadió el texto accesible “Es la única passkey; no se puede revocar para evitar perder el acceso.” La prueba E2E confirma que el botón está deshabilitado, anuncia la explicación y no envía la acción. La revocación de una segunda passkey requiere un autenticador independiente y sigue pendiente.
4. **Validación física de WebAuthn con una limitación explícita.** Se completó un ingreso nuevo con passkey en Chrome de Ubuntu mediante PIN y otro en Moto G15; ambos llegaron a `/inicio`. Desde el teléfono se revocó la sesión de Ubuntu; Ubuntu perdió acceso y luego pudo ingresar de nuevo con la misma passkey. La persona confirma que todas las pruebas que pudo hacer pasaron. Al agregar `ubuntu-chrome`, Chrome reportó `InvalidStateError` porque el autenticador elegido ya contiene la credencial existente; no fue un rechazo del PIN ni del servidor. El servidor respondió 200 a `registration/options` y no recibió `registration/verify`. La persona no cuenta con un autenticador independiente y deja pendiente esa prueba, junto con revocación de una segunda passkey y recuperación completa. La expiración tampoco se esperó durante 30 días ni cuenta con prueba automatizada identificada.
5. **Método de build seleccionado y validado.** El comando habitual del proyecto ahora usa Webpack y pasa completo. Turbopack falla al procesar CSS cuando intenta abrir un puerto interno en este host; quedó fuera del método seleccionado para producción.
6. **Decisión de alcance — solicitudes de atención.** `/admin` ofrece `ServiceRequest` como puerta habitual; la app nueva inicia tratamiento directamente. **Cierre:** decidir si alta, revisión y aceptación de solicitudes son necesarias antes del primer uso real.
7. **Brechas posteriores — resumen, informe y offline.** La persona priorizó un resumen de visita para la familia, como texto para WhatsApp. Se implementó un borrador editable en visitas finalizadas que incluye las evaluaciones/mediciones de esa visita y evita repetir un valor ya escrito en la evolución; no altera ni persiste la nota y el enlace no envía automáticamente. Pasaron pruebas unitarias, build, emulación desktop/móvil y la persona confirmó su funcionamiento en Moto G15. El incremento posterior implementa informes PDF definitivos y reemplazos; su validación física queda pendiente. Offline permanece postergado y requiere diseño de privacidad antes de persistir clínica en un dispositivo.
8. **Operación real pendiente.** HAPI/Casa documenta backup y restauración manual; automatización y monitoreo figuran fuera de alcance de esa infraestructura. **Cierre:** elegir y probar un procedimiento protegido de copia y restauración, revisar logs y resolver acceso privado antes de cualquier dato real.
9. **Deriva de fixtures en Agenda — resuelta de forma acotada.** En la vista física del 30/09 aparecieron varias filas de Rosa a las 11:00; la cita semilla `demo-appt-tomorrow` existe a las 10:30. La consulta a HAPI `8081` identificó cuatro reservas activas adicionales que reemplazaban esa semilla: `appointment-74855153-f272-4d8b-af26-af577421b7fe`, `appointment-6ff18f56-f9d7-401d-8c4e-24f869815f1a`, `appointment-b2b74c52-0eef-46ac-9301-286f03a1a8c0` y `appointment-950c4e01-f0f0-44eb-af06-0acf0388f7e2`. Con autorización explícita el 2026-09-29, se borraron lógicamente estas cuatro citas con control de versión; HAPI respondió 200 al borrar y 410 al releerlas. Se verificó que `demo-appt-tomorrow` y las citas canceladas —incluida la cadena de reprogramación— siguen accesibles (200). Las demás citas y recursos se conservaron. No se intentó atribuir autoría porque HAPI no devuelve Provenance, AuditEvent ni `meta.source`/`meta.tag` útiles. La cobertura E2E de cruces pasa.

10. **Recuperación de visita en curso.** En Ubuntu se iniciaron tres visitas ficticias de prueba y se comprobó reanudación tras navegación, recarga y cierre de pestaña; todas se anularon con motivo “Registrada por error”. La persona confirma que las demás pruebas guiadas que pudo completar pasaron, salvo autenticador independiente; no indicó resultado por escenario. Además, se añadieron simulaciones deterministas de respuesta perdida tras persistir el inicio, la finalización, la visita diferida, reprogramación y cancelación: los reintentos recuperaron el mismo ID sin volver a ejecutar la escritura. **Límite:** la simulación no equivale a cortar la red durante un guardado físico. No se conoce prueba automatizada para caducidad de sesión; el plazo configurado es 30 días.

## Comparación acotada con `/admin`

| Capacidad anterior | Estado en la app nueva | Clasificación para el reemplazo |
|---|---|---|
| Pacientes, tratamientos, visitas, métricas | Núcleo online presente | Necesaria; probar compatibilidad de lectura/escritura antes del corte |
| Solicitudes de atención (`ServiceRequest`) | No hallada en el código nuevo | Decisión pendiente; conservar si forma parte del ingreso diario |
| Resumen compartible de visita | Implementado y confirmado en Moto G15 | Disponible; revisar privacidad y destinatarios antes de datos reales |
| Informe de evolución/cierre | Períodos, informes definitivos y reemplazos implementados con datos ficticios | Prioridad elegida; aceptación física y requisitos operativos pendientes |
| `/admin` como respaldo | Sigue en el repositorio anterior | Mantener hasta cumplir paridad mínima acordada y probar reversión |
| Portal familiar, SaaS multiusuario, historia integral y copia offline total | Fuera de alcance declarado | Excluidas de la V1 actual salvo nueva decisión explícita |

## Los ocho casos E2E que no corrieron en la primera ejecución

No fueron fallos adicionales. Los casos de escritorio en `clinical-home.spec.ts` están en `test.describe.serial`; al fallar la navegación de calendario, Playwright detuvo ese grupo. En aquella ejecución no corrieron:

1. separar pendientes y mostrar una ficha completa;
2. abrir desde la ficha las opciones de una visita pendiente anterior;
3. comenzar o registrar una cita sin horario;
4. enlazar evaluaciones con la evolución longitudinal;
5. advertir y confirmar un cruce horario;
6. reprogramar, cancelar y marcar una visita como no realizada;
7. comenzar, continuar y finalizar una visita enlazada;
8. anular un inicio accidental.

La omisión se debía a la política serial, no a HAPI ni a fallas individuales en esos casos. En la corrida final, después de corregir el primer bloqueo y alinear los casos siguientes, se ejecutaron y aprobaron todos los 26 tests.

## Límites de esta auditoría

Se ejecutó Playwright con Chrome de escritorio y emulación de Chrome móvil; esas pruebas no equivalen al teléfono físico. Sí se probaron passkeys reales en Ubuntu y Moto G15, además de revocación de una sesión. No se probaron backups ni se usaron datos reales. La segunda passkey, su revocación y la recuperación completa quedan pendientes porque requieren un autenticador independiente.


## Incremento de períodos e informes — 29/09/2026

### Aceptación por etapa

| Etapa | Evidencia ejecutada | Resultado y condición pendiente |
|---|---|---|
| 1. Períodos y cupo | Dominio/casos de uso; HAPI con cupos 1/10, rechazo de 0, 9 realizadas + 1 reservada, competencia por última plaza, dos cierres iguales/diferentes, reintento de visita 10, renovación con cupo/frecuencia nuevos, materialización concurrente y legados sin cupo/con exceso | Aprobada automáticamente. Sin contadores persistidos; pertenencia antigua permanece en período 1. Renovación exige informe vigente. |
| 2. Informes y PDF | Borrador, guardado/reintento atómico, bytes descargados idénticos, huella canónica, ausencias/ceros/una medición, fuentes modificadas conservando texto, rechazos por sesión inválida/revocada; PDF local de producción de seis páginas con fuente local, primera/última página renderizadas | Aprobada automáticamente y PDF revisado visualmente. Otro host requiere repetir la comprobación de PDF. Borradores en memoria, sin respaldo local. |
| 3. Cierre y reemplazos | HAPI: parcial 6/10 y cancelación, visitas en curso y citas abiertas bloquean finalizar, reemplazo obligatorio de informe desactualizado, corrección de período cerrado independiente del nuevo, dos reemplazos concurrentes con una cadena vigente, alteración de PDF/JSON detectada | Aprobada automáticamente. **Cierre físico pendiente** del recorrido nuevo en Ubuntu/Chrome y Moto G15/Chrome. |

### Comprobaciones finales

| Comprobación | Aprobadas | Fallidas | Omitidas / bloqueadas |
|---|---:|---:|---|
| Lint | 1 ejecución final | 0 | Ninguna |
| Unitarias | 116 casos, 31 archivos | 0 | 16 casos en 5 archivos de integración, condicionados al endpoint; ejecutados separadamente abajo |
| Integración HAPI 8081 | 16 casos, 5 archivos | 0 | Ninguna; 10 casos nuevos de períodos/informes y 6 existentes |
| Navegador Chrome desktop + emulación móvil | 31 casos | 0 | Ninguna en la corrida aprobada; no equivale a Android físico |
| Build de producción Webpack | 1 ejecución final | 0 | Ninguna en el método configurado |
| Dispositivos físicos del incremento | Sin resultado todavía | No atribuir fallos sin ejecución | Recorrido nuevo pendiente de confirmación de la persona |

El soporte de CarePlan, DocumentReference, Binary, búsquedas estándar, versiones y transacciones se comprobó en CapabilityStatement del HAPI dev 8.8/R4 antes de escribir fixtures. La transacción de informes incluye DocumentReference y ambos Binary; los conflictos no dejaron archivos huérfanos. Fuente DejaVu Sans y 15 archivos de runtime de PDFKit aparecen en el trazado final de producción. La ruta temporal de comprobación y su almacén de sesión ficticio se retiraron.

Evidencia reproducible: `src/domain/treatment-period/*.test.ts`, `src/application/periods/*.test.ts`, `src/application/home/get-clinical-home.test.ts`, `tests/integration/period-report.fhir.integration.test.ts` y `tests/e2e/period-reports.spec.ts`. No se incorporaron exports FHIR, secretos ni capturas al repositorio. Los fixtures nuevos tienen identidad única y limpieza transaccional.

### Incidencias encontradas y resueltas

- Un fixture fijo de integración acumulaba visitas al repetir las pruebas y agotaba su cupo. Se cambió a identidades únicas y limpieza atómica de sus propios recursos. Las suites que comparten el entorno ficticio se ejecutaron sin superponer integración y navegador.
- La prueba de anular un inicio navegaba antes de terminar la acción; se hizo esperar la redirección. Otra expectativa encontraba tanto la nota clínica como el resumen familiar: se precisó la coincidencia exacta. En la corrida aprobada no quedó ningún caso serial sin ejecutar.
- Una referencia de período inválida bloquea ese tratamiento y muestra **Período sin verificar** en Inicio, conservando la consulta de los otros pacientes; tiene prueba de aplicación.
- La materialización de un legado podía actualizar la versión esperada durante una edición y sobrescribir metadatos concurrentes. Se agregó comprobación de revisión y pertenencia antes de continuar; un caso HAPI reproduce la carrera y confirma que se conserva la edición del otro dispositivo. Después se repitieron integración, unitarias, lint y build; no se modificó el recorrido común validado por navegador.

### Condiciones que continúan abiertas

1. Ejecutar y registrar los bloques de `docs/pruebas-fisicas-periodos.md`. No se declara cerrada la tercera etapa con las pruebas automáticas solamente.
2. PWA/offline y respaldo protegido de borradores permanecen postergados. Refrescar/cerrar puede perder el texto pendiente.
3. El hito de datos reales exige identidad/matrícula, requisitos de destinatarios, conservación y registros de accesos/emisiones, infraestructura privada, permisos, backups y restauración, además de repetir PDF en el host definitivo. Ver `docs/privacy.md`.
4. La inmutabilidad es de aplicación: los hashes detectan discrepancias archivadas, pero no protegen frente a un administrador de HAPI que cambie conjuntamente archivos y hashes.
5. La prueba anterior con autenticador independiente permanece pendiente por falta de ese dispositivo; es distinta de este recorrido de períodos/informes.
