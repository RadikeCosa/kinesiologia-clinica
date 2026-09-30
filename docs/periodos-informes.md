# Períodos e informes de evolución

Incremento implementado el 29/09/2026. Exclusivo del entorno ficticio local HAPI 8081. La aceptación física del recorrido nuevo en Ubuntu y Moto G15 queda separada de las comprobaciones automáticas.

## Uso

Desde una ficha, **Ver períodos e informes** abre el período vigente, sus sesiones y el historial. Pacientes muestra **Informe pendiente** al completar el cupo. La visita y el período son conceptos distintos: renovar conserva el tratamiento y crea otro período; corregir la fecha de una visita conserva su pertenencia.

El cupo admite 1–500. Las visitas finalizadas consumen una plaza realizada; las visitas en curso reservan una plaza. Las anuladas no consumen cupo. No se almacenan contadores. Con 9 realizadas y una en curso sobre 10, solo se puede continuar esa visita. No se admite más de una en curso por tratamiento y se conserva la restricción global del inicio en vivo.

El informe breve se prepara con los registros existentes, sin IA ni conclusiones clínicas automáticas. Conteos, sesiones y mediciones son datos estructurados; contexto, evolución, intervenciones, próximo paso y observaciones son editables. El profesional debe completar su nombre; la matrícula es opcional. Primera y última medición pertenecen a la misma serie. Una medición única aparece una vez, con **Sin dato para comparación**; los valores cero y las ausencias justificadas se conservan. Contextos o unidades distintos se muestran sin calcular diferencias. Fechas visibles: `America/Argentina/Buenos_Aires`.

**Guardar informe definitivo** exige confirmación. Después solo se permite consultar, descargar el PDF o emitir un reemplazo con motivo. El informe original permanece en el historial. El reemplazo utiliza los datos actuales y propone el texto del informe vigente para revisión.

Los borradores se mantienen en memoria de la pantalla. Los campos editados se conservan cuando falla un guardado. Si cambian los registros fuente, se bloquea el guardado y se pueden consultar sus datos actualizados, conservar el texto propio y volver a confirmar. Hay aviso de cambios sin guardar y protección del navegador al refrescar/cerrar; no existe respaldo después de cerrar ni almacenamiento clínico local de borradores. El respaldo protegido corresponde al incremento PWA/offline.

## Transiciones

La pausa pertenece al tratamiento; no cambia la fase de informe del período.

| Fase | Evento | Resultado |
|---|---|---|
| Abierto | Atender sin completar cupo | Abierto |
| Abierto | Finalizar última plaza | Informe pendiente por cupo |
| Abierto | Solicitar cierre parcial, con realizadas y sin visita en curso | Informe pendiente por cierre parcial; motivo obligatorio |
| Pendiente parcial | Cancelar antes de guardar | Abierto, verificando nuevamente el conteo |
| Pendiente por cupo | Anular y quedar debajo del cupo | Abierto |
| Pendiente | Guardar definitivo | Informe guardado |
| Informado | Renovar, fuentes actuales y tratamiento activo | Anterior cerrado; siguiente abierto, contador cero |
| Informado | Finalizar, fuentes actuales y citas resueltas | Cerrado; tratamiento finalizado |
| Abierto sin realizadas ni reservas | Finalizar con citas resueltas | Cerrado sin informe vacío |
| No cerrado | Pausar/reanudar | Misma fase; cambia disponibilidad |
| Informado | Corregir/anular fuentes | Informado desactualizado; reemplazo requerido antes de renovar/finalizar |
| Cerrado | Corregir/anular fuentes | Cerrado; diferencia señalada |
| Cerrado | Reemplazar voluntariamente | Cerrado; nueva versión vigente |

El cierre parcial permite finalizar, no renovar anticipadamente. La finalización rechaza citas `booked`/`proposed` y visitas en curso. Si todas las visitas de un período ya informado se anulan, el reemplazo puede documentar esa diferencia con cero realizadas; no se crea un primer informe vacío ni se omite la comprobación del informe previo.

No puede aumentarse el cupo de un período completo o informado para eludir el informe. En un período abierto, los cambios de cupo respetan las plazas realizadas y reservadas. La renovación propone el cupo y frecuencia anteriores, editables, y requiere un informe actualizado. Tras renovar, la interfaz abre el período nuevo.

## Persistencia y concurrencia

- `EpisodeOfCare` conserva el tratamiento y una referencia al período vigente (`episodeofcare-current-period-v1`), más revisión de metadatos.
- Un `CarePlan` por período: `intent=plan`, paciente en `subject`, tratamiento en `supportingInfo`, categoría local `treatment-period`. Su extensión `treatment-period-v1` contiene identidad, ordinal, cupo, frecuencia, fase, motivo parcial, disponibilidad y revisión clínica. Otra extensión contiene el informe vigente como `valueReference`, para que HAPI resuelva las referencias de transacción.
- `CarePlan.status`: `active` disponible, `on-hold` no disponible, `completed` cerrado. Esta disponibilidad no reemplaza la fase propia de informe. Se consultan parámetros estándar `patient` y `category` y se filtra el vínculo al tratamiento en infraestructura; no se requiere SearchParameter propio.
- `Encounter` lleva `encounter-period-v1`. Los antiguos sin etiqueta pertenecen siempre al período 1.
- Admisión, finalización, corrección y anulación incluyen `CarePlan` con `If-Match`, incremento de revisión y recursos clínicos afectados en una transacción. La lectura de su versión precede al conteo. El cupo no depende de una cola en memoria ni de actualizar EpisodeOfCare por cada visita.
- Pausa, reanudación y edición de tratamiento actualizan tratamiento y período atómicamente. Identidad del paciente actualiza las revisiones de sus tratamientos. Las citas guardan una versión del tratamiento en su transacción, para serializarse con la finalización.
- Guardado de informe, renovación y finalización comprueban versiones de período, tratamiento y paciente. Una intervención concurrente invalida la escritura; no se sobrescriben fuentes nuevas.

## Archivos e inmutabilidad

Cada emisión guarda un `DocumentReference` y dos `Binary`: PDF y JSON con contenido definitivo, copia fuente, fecha, identidad de operación, autor y versiones fuente. La transacción vincula el documento al período. La creación de DocumentReference es condicional por identidad de operación; un reintento recupera el informe existente y rechaza contenido diferente. Los IDs de archivos se derivan de esa operación. Un conflicto de versión revierte toda la transacción, incluidos los archivos.

El único cambio permitido sobre un informe anterior es `DocumentReference.status=current → superseded` al reemplazarlo. El original y sus Binary no se editan ni se borran desde los puertos de aplicación. Un reemplazo guarda `relatesTo=replaces`, motivo y fecha propios, y solo puede partir del informe vigente. El período y el documento anterior usan versiones esperadas para evitar cadenas divergentes.

SHA-256 comprueba contenido, copia fuente y bytes PDF. Un hash adicional comprueba todos los bytes del archivo JSON, incluida su trazabilidad. Leer o descargar verifica estos hashes, referencias y pertenencia. Una discrepancia bloquea la operación. Esto garantiza inmutabilidad en la aplicación y detección de discrepancias, no almacenamiento WORM: HAPI permite mutaciones administrativas y alguien que altere archivos y hashes conjuntamente puede eludir esta detección.

`/informes/[reportId]/pdf` recibe únicamente la identidad del informe. Comprueba sesión vigente, paciente, tratamiento, período y archivos resueltos por el servidor. Responde con `private, no-store`; no recibe URLs ni IDs arbitrarios de Binary ni comunica HAPI al navegador. Una sesión inválida o revocada recibe 401.

## sourceFingerprintV1

SHA-256 sobre JSON canónico: claves ordenadas lexicográficamente, colecciones de entidades ordenadas por identidad, fechas ISO UTC y opcionales ausentes como `null`.

Incluye identidad/nombre del paciente; contexto, objetivos, precauciones y diagnósticos; identidad/ordinal/cupo/frecuencia/motivo parcial del período; pertenencia y estado de todas sus visitas, horarios y notas de las finalizadas; observaciones y procedimientos vigentes con identidad, serie, fecha, resultado, unidad y contexto. Las observaciones históricas con varias proyecciones se incluyen una sola vez por identidad, priorizando síntomas y evaluaciones sobre métricas antiguas.

Excluye estados administrativos, referencias al informe, revisiones de control y versiones técnicas. Las versiones se archivan aparte, identificadas por tipo de recurso e identidad. La huella se recalcula al guardar, renovar y finalizar; permite señalar cambios de fuentes sin modificar el informe archivado.

## Legados

Período inicial: `tp-` + primeros 40 caracteres hexadecimales de SHA-256(`treatment-period-v1:{treatmentId}:1`). Se materializa y vincula al tratamiento en una transacción con versión esperada. Las inicializaciones simultáneas convergen. Los GET no materializan períodos.

Sin cupo válido, la única cuenta profesional puede **Definir cupo del período** y se bloquean visitas nuevas. Si el legado supera el cupo, se conserva el número real y el informe incluye todas sus sesiones. Las visitas no se reparten retrospectivamente en bloques. Los tratamientos ya finalizados siguen finalizados y muestran la ausencia de informe histórico. Una referencia inválida se bloquea; Inicio no inventa un contador ni impide consultar los demás pacientes.

## Evidencia y cierre

La matriz de aceptación y los resultados finales se registran en `docs/audit-estado-actual.md`. La comprobación inicial de PDF se ejecutó antes del editor completo: build de producción Next en Ubuntu/Node, fuente local DejaVu Sans con licencia incluida, PDFKit externo y 15 archivos de runtime/fuentes incluidos en el trazado. Generó un PDF ficticio de seis páginas; texto extraído y primera/última página renderizadas sin recortes ni pérdida de tildes. La ruta temporal de prueba se retiró después de comprobarlo.

La compilación local no acredita otro host de despliegue. Repetir generación y descarga en el paquete/host definitivo antes de habilitar datos reales. La revisión física del incremento está en `docs/pruebas-fisicas-periodos.md`.
