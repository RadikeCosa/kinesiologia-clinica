# Plan de evolución

Este plan toma como baseline la auditoría del 2026-09-28. No asigna fechas: el avance depende de evidencia y condiciones de cierre. Las funciones nuevas comienzan después del hito **Núcleo estable**; preparar el uso real es un hito distinto y más exigente.

**Actualización (2026-09-29):** la persona confirmó que todas las pruebas guiadas que pudo completar pasaron, salvo usar un autenticador independiente, que no tiene disponible. La etapa 1 quedó cerrada al configurar Webpack para el build. En la etapa 2, se corrigió la explicación visual de la última passkey y se añadieron pruebas de reintento tras perderse una respuesta; las suites completas pasan. Con autorización explícita, se borraron lógicamente de HAPI 8081 las cuatro citas ficticias activas duplicadas del 30/09 a las 11:00; las canceladas, la cita semilla y las demás citas se conservaron y verificaron.

## Etapa 1 — Cerrar la auditoría técnica reproducible

**Objetivo:** resolver los resultados bloqueados por el entorno y obtener una línea base completa.
**Dependencias:** HAPI descartable `8081` disponible; entorno que permita compilar Next.

- Ejecutar `npm run test:integration:fhir`, revisar aprobados/fallidos/omitidos y confirmar que las escrituras/relecturas y los reintentos no duplican recursos.
- Ejecutar `npm run test:e2e` y comprobar el recorrido de Hoy, agenda, pacientes y visitas. **Completado:** 27/27 aprobados, sin fallos ni omisiones; la suite se alineó con el comportamiento vigente y usó HAPI ficticio en `8081`.
- Seleccionar y validar el bundler de producción. **Completado:** el script `build` usa Webpack y `npm run build` pasa en este host con ejecución ampliada.
- Resolver qué comportamiento esperan los E2E que fallaron (navegación mensual, acciones en “Más”, tipos de enlace y separación entre síntomas y evaluaciones), corregir producto o pruebas según el contrato acordado y repetir la suite completa. **Completado:** eran expectativas y selectores obsoletos; no se confirmó defecto de producto.
- Registrar resultados reproducibles y actualizar el audit si cambian las conclusiones.

**Finaliza cuando:** integración pasa, E2E pasa sin fallos y sin omisiones críticas, y el método de build elegido termina en un entorno compatible. **Etapa cerrada:** integración 6/6, E2E 27/27 y `npm run build` con Webpack completan. Turbopack permanece como limitación conocida de este host, no como requisito pendiente.

**Evidencia y resolución (2026-09-29):** `FHIR_BASE_URL=http://localhost:8081/fhir npm run build -- --webpack` pasó: compilación, TypeScript, páginas estáticas y trazas completados. El comando predeterminado previo fallaba en Turbopack al procesar `globals.css`, porque el proceso de PostCSS intenta abrir un puerto y recibe `Operation not permitted`, incluso con ejecución ampliada. Se cambió el script `build` de `package.json` a `next build --webpack` y se volvió a ejecutar el comando documentado `FHIR_BASE_URL=http://localhost:8081/fhir npm run build`; pasó completo. Este host requiere ejecución ampliada para que Next inicie su proceso hijo de TypeScript (`EPERM` en el sandbox restringido).

**Reverificación (2026-09-29):** `npm run lint` pasó; `npm run test` pasó con 100 casos aprobados y 6 omitidos; `npm run test:integration:fhir` pasó 6/6 contra `localhost:8081` con acceso local autorizado; `npm run test:e2e` pasó 27/27; y `FHIR_BASE_URL=http://localhost:8081/fhir npm run build` pasó con Webpack. El setup E2E usa seis pacientes ficticios y dos citas temporales aleatorias; al terminar vuelve a sembrar recursos conocidos y marca como `entered-in-error` otros `Encounter` de esos pacientes demo. No borra las citas adicionales de Agenda descritas en el audit. El fixture conocido `demo-appt-overdue` quedó restablecido por la siembra E2E, así que la prueba manual de “No se realizó” queda como evidencia histórica, no como estado actual de esa cita.

## Etapa 2 — Cerrar el núcleo online

**Objetivo:** confiar en la atención de extremo a extremo con datos ficticios antes de sumar capacidades nuevas.

- Reproducir alta/edición de paciente y tratamiento, agenda, cancelación/reprogramación/ausencia, visita en curso, carga diferida, síntomas/evaluaciones, corrección y anulación.
- Comprobar reintentos tras respuesta incierta, recuperación de visita en curso, conflicto `If-Match` y coherencia de lo releído desde HAPI. **Completado en tests:** se simula escritura persistida seguida de respuesta perdida para inicio/finalización de visita, registro diferido, reprogramación y cancelación; el reintento vuelve al mismo ID y no repite la transacción. La integración FHIR confirma reintentos sin duplicación. La simulación determinista no sustituye cortar una conexión física durante el guardado.
- Completar regresión móvil y estados de error, carga, foco y teclado; resolver fallos que bloqueen una tarea esencial o causen pérdida, duplicación o interpretación ambigua del registro.
- Hacer visible que **Revocar passkey** está deshabilitado cuando solo queda una credencial, para que no parezca un botón operativo. **Completado:** ahora la interfaz lo explica; prueba E2E verifica estado disabled, descripción accesible y ausencia de acción.
- Resolver la deriva de citas ficticias de Agenda. **Completado (2026-09-29):** tras autorización de la persona, se borraron lógicamente las cuatro reservas activas duplicadas que reemplazaban `demo-appt-tomorrow` el 30/09 a las 11:00: `appointment-74855153-f272-4d8b-af26-af577421b7fe`, `appointment-6ff18f56-f9d7-401d-8c4e-24f869815f1a`, `appointment-b2b74c52-0eef-46ac-9301-286f03a1a8c0` y `appointment-950c4e01-f0f0-44eb-af06-0acf0388f7e2`. HAPI respondió 200 al borrado y 410 al releer cada recurso. Se verificó que `demo-appt-tomorrow` y las citas canceladas de la cadena permanecen accesibles (200); también se conservaron las demás citas, incluidas las de otras fechas. No se borraron Encounter, pacientes ni tratamientos.
- Cerrar la revisión visual manual pendiente de acceso, recuperación y dispositivos. **Completado según confirmación de la persona:** todas las pruebas guiadas posibles pasaron; el único caso que no pudo ejecutar fue con un autenticador independiente. Ese resultado se registra como informado por la persona.

**Finaliza cuando:** los recorridos esenciales pasan de punta a punta; no queda abierto un fallo crítico de acceso o integridad clínica; los hallazgos menores tienen decisión y seguimiento documentados. Los recorridos y reintentos de código pasan, la persona confirma las pruebas guiadas físicas y la agenda ficticia contaminada se limpió de forma acotada y verificada. **Etapa 2 cerrada (2026-09-29).** La prueba con autenticador independiente permanece pendiente en la etapa de acceso, porque la persona no dispone de uno.

**Evidencia y estado informado (2026-09-29):** en Ubuntu se abrió el registro ficticio `/patients/demo-rosa`; cargó Rosa Benítez con tratamiento activo y se comprobaron las secciones separadas de evolución de síntomas y evaluaciones. Se registró una visita diferida ficticia, se releyó correctamente, se corrigió con motivo visible y luego se anuló; dejó de contar como realizada sin borrarse. Se probaron tres inicios de visita: en todos la visita apareció como “En curso” en Hoy y “Continuar” abrió el mismo registro; en uno se recargó la página y en otro se cerró la pestaña, se abrió una nueva y se retomó el mismo identificador. Los tres inicios de prueba se anularon y quedaron en el historial con “Registrada por error”. La visita no realizada se probó sobre la cita semilla conocida `demo-appt-overdue` (27/09, 11:00): se registraron motivo ficticio “Paciente ausente del domicilio” y nota, bajaron las pendientes y el historial mostró “No se realizó”. La vista Agenda cargó, pero el 30/09 mostró varias filas a las 11:00 y una fila “Reprogramada”, distinto del baseline del seed. La persona reprogramó una cita de Rosa de las 11:00 al 02/10 a las 15:00; `saveAppointment` respondió 200, no hubo aviso de superposición y Agenda mostró la nueva cita confirmada. Luego canceló esa misma cita y Agenda mostró “Cancelada”; la comprobación de cancelación quedó aprobada. El 2026-09-29, con autorización explícita, se borraron lógicamente solo las cuatro reservas activas duplicadas del 30/09 a las 11:00; se verificó que las cuatro devuelven 410 y que la semilla `demo-appt-tomorrow` y las canceladas de la cadena siguen presentes. No se tocó el entorno 8080. La cobertura E2E de cruces horarios pasa. La persona confirmó que todas las pruebas guiadas que pudo completar pasaron; la única prueba que dejó pendiente fue registrar un autenticador independiente. Las nuevas simulaciones de reintento por respuesta perdida y las suites completas pasaron; la expiración de 30 días sigue sin prueba determinista. El build con Webpack está cerrado; Turbopack queda como limitación conocida de este host.

## Etapa 3 — Validar acceso en Ubuntu y Android

**Objetivo:** comprobar autenticación y recuperación en los dispositivos que se usarían.

**Entorno autorizado para esta etapa:** solo datos ficticios y HAPI en `http://localhost:8081/fhir`; aplicación por el origen HTTPS local `https://dev-pc.local:3000`. No usar el puerto HAPI `8080`, datos reales ni enlaces con advertencias de certificado. Si el origen no abre de forma segura o aparece un error distinto al esperado, detenerse y comunicar el texto visible sin compartir credenciales.

### Secuencia guiada

1. **Preparar los códigos de recuperación.** Los códigos ya fueron renovados y guardados por la persona usuaria. Mantenerlos disponibles fuera del teléfono para la prueba final. No pegarlos en el chat ni compartir capturas donde se vean. La vista de recuperación puede volver a mostrarlos en el árbol de accesibilidad del navegador.
2. **Comprobar ingreso físico en Android.** En Chrome del Moto G15, abrir `https://dev-pc.local:3000/ingresar`, elegir **Usar passkey** y completar el PIN/biometría que solicite Android. Confirmar que llega a `/inicio`. Si aparece un selector ambiguo o un error, detenerse y reportar únicamente el texto no sensible. No revocar todavía la sesión del teléfono.
3. **Probar revocación de la sesión de Ubuntu desde Android.** Esto puede probarse aunque todavía haya una sola passkey. En Moto G15, abrir `/configuracion/dispositivos` y comprobar que haya exactamente dos sesiones: la del teléfono marcada **Esta sesión** y una única fila restante, correspondiente al Ubuntu que acaba de iniciar sesión. Como ambas se crearon con la passkey etiquetada “Moto G15”, pueden compartir esa etiqueta; guiarse por **Esta sesión**, no por el nombre. Revocar solo la fila que no está marcada como actual. Confirmar que Ubuntu vuelva a `/ingresar` y que Moto G15 siga dentro de la app. Si la cantidad de filas o la marca de sesión actual no coincide, detenerse antes de revocar.
4. **Volver a ingresar en Ubuntu.** Tras comprobar la revocación anterior, en Chrome de Ubuntu abrir `/ingresar`, pulsar **Usar passkey** y completar el PIN. Confirmar `/inicio`. Esto comprueba que revocar una sesión no elimina la passkey ni bloquea un ingreso posterior.
5. **Conseguir un segundo autenticador independiente.** El intento de agregar `ubuntu-chrome` falló con `InvalidStateError` porque el autenticador elegido ya contiene una credencial registrada para esta cuenta. No repetir con ese autenticador. Para validar revocación de passkey se necesita otro autenticador/almacén que no contenga la passkey actual, por ejemplo una llave de seguridad o un dispositivo con almacén independiente. Si no hay uno disponible, dejar revocación de passkey y recuperación como pendientes; no retirar la protección contra eliminar la última passkey.
6. **Probar revocación de passkey cuando haya dos credenciales independientes.** Desde la sesión de control en Moto G15, revocar la nueva credencial identificada por su nombre único. Confirmar que desaparezca y que siga registrada la credencial original `Moto G15`. Nunca revocar la última credencial restante.
7. **Probar recuperación con un código, al final y con autenticador disponible.** Usar un código guardado y completar el alta de una passkey nueva en un autenticador que no tenga la credencial existente. El flujo debe invalidar credenciales anteriores y revocar sesiones existentes; confirmar el ingreso a `/inicio`. Guardar fuera del teléfono el nuevo conjunto de códigos y pulsar **Ya los guardé** para ocultarlos. Comprobar desde el otro dispositivo que la sesión anterior ya no permite entrar. Esta operación invalida sesiones y passkeys previas; por eso va al final.
8. **Cerrar el registro de resultados.** Informar por dispositivo navegador, escenario, resultado y texto de error no sensible. No enviar PIN, código de recuperación, QR, secreto ni captura que los muestre.

**Expiración de sesión:** la sesión dura 30 días y se renueva con actividad. No es una prueba física breve: se considera pendiente hasta cubrirla con una prueba automatizada determinista o una ventana real sin actividad; no cambiar el reloj ni editar la base de autenticación para simularla durante esta guía.

**Actualización (2026-09-29):** la persona confirmó acceso directo en Moto G15. El intento de agregar `ubuntu-chrome` terminó con `InvalidStateError`: el autenticador local seleccionado contiene una credencial que ya está registrada con este relying party. Los registros muestran `registration/options` 200 y ninguna solicitud `registration/verify`, consistente con rechazo del duplicado antes de enviar una credencial al servidor. No se creó una segunda passkey. No repetir con ese autenticador; las revocaciones y la recuperación que requiera reemplazar credenciales quedan pendientes hasta tener un autenticador con almacenamiento independiente. Nunca revocar la única passkey `Moto G15`.

**Resultado guiado (2026-09-29):** desde Moto G15 se revocó la otra sesión, correspondiente a Ubuntu. Ubuntu perdió acceso y volvió a `/ingresar`; después inició sesión de nuevo con la passkey y llegó a `/inicio`. También se cerró la sesión del Moto G15 y se completó un ingreso nuevo con passkey que llegó a `/inicio`. Quedan aprobados los ingresos nuevos en ambos dispositivos, la revocación de sesión y la validez continuada de la passkey. Pendiente: autenticador independiente para segunda passkey, revocación de passkey y recuperación.

**Evidencia verificada (2026-09-29):** se completó ingreso nuevo con passkey en Chrome de Ubuntu y Moto G15. Desde el teléfono se revocó la otra sesión; Ubuntu perdió acceso y pudo volver a ingresar con su passkey. La persona renovó y guardó los códigos. La lista mostraba una sola passkey etiquetada “Moto G15”; el segundo alta intentado en Ubuntu falló con `InvalidStateError` porque el autenticador elegido ya contiene la credencial existente, por lo que no se creó otra. La revocación de sesión y los dos ingresos nuevos están aprobados. Pendientes: autenticador independiente para segunda passkey, revocación de credencial, recuperación y expiración física/automatizada de sesión.

**Cierre informado por la persona (2026-09-29):** confirma que todas las pruebas guiadas que pudo completar pasaron y que solo deja pendiente usar un autenticador independiente, porque no tiene uno. La revocación de segunda passkey y la recuperación completa dependen de esa credencial; la expiración de 30 días requiere una prueba separada.

### Lista paso a paso de lo que requiere tus dispositivos o credenciales

Los recorridos A, B y C de abajo se consideran completados según tu confirmación; no hace falta repetirlos. Los ingresos nuevos, revocación de sesión, renovación de códigos y passkey actual también pasaron. Solo queda D cuando tengas un autenticador independiente. La expiración de 30 días sigue pendiente de validación automatizada o de esperar el plazo real. El Moto G15 no está disponible para control remoto desde esta sesión. En pasos de autenticación, completá tú las pantallas; no compartas PIN, códigos, QR ni capturas que los muestren.

**A. Recorrido clínico físico en Moto G15 — completado según confirmación**

1. Abrí `https://dev-pc.local:3000/inicio?vista=pacientes` en Chrome del Moto G15. Si el navegador muestra una advertencia de certificado, detenete sin saltarla. Si pide ingresar, usá la passkey ya comprobada.
2. Buscá a Rosa Benítez y pulsá **Comenzar visita**. Confirmá que la pantalla diga **VISITA EN CURSO** y que el formulario se pueda recorrer con teclado táctil.
3. Volvé a **Hoy**. Rosa debe figurar **En curso**. Pulsá **Continuar** y comprobá que abra la misma visita.
4. Pulsá **Anular inicio accidental**. En la ficha, confirmá que aparece bajo **Visitas anuladas** y que ya no está en curso. No la finalices.
5. Desde la ficha de Rosa, abrí **Registrar visita**. Usá solo texto ficticio, por ejemplo `Prueba móvil de auditoría` y `Intervención ficticia de prueba`; añadí dolor ficticio `3/10` si el formulario lo permite. Pulsa **Finalizar visita** y verifica que la visita y la medición aparezcan en la ficha.
6. Abrí **Corregir visita**, cambiá la medición ficticia a `4/10`, escribí como motivo `Corrección de prueba móvil` y guardá. Confirmá que la ficha muestre el valor y motivo corregidos.
7. En esa misma visita, abrí el panel de anulación, escribí `Registro ficticio de prueba móvil` y confirmá. Verificá que no cuente como realizada y que aparezca en **Visitas anuladas**. Si no ves esos controles, no improvises: anotá la pantalla y la etiqueta visibles.

**B. Recuperación después de cerrar completamente Chrome en Android — completado según confirmación**

1. Iniciá otra visita de prueba de Rosa con el teléfono conectado y dejá abierto el formulario en curso. No escribas notas ni pulses **Finalizar visita**.
2. Abrí las aplicaciones recientes de Android y cerrá Chrome por completo. Volvé a abrir Chrome y entrá otra vez a `https://dev-pc.local:3000/inicio`.
3. Si sigue dentro de la sesión, comprobá que Hoy muestra a Rosa **En curso**; si pide ingreso, usá la passkey que ya probaste. Pulsá **Continuar** y confirmá que sea la misma visita.
4. Pulsá **Anular inicio accidental** y confirmá que no quede en curso. No finalices esta visita de prueba.

**C. Recuperación después de un corte de conexión en Android — completado según confirmación**

1. Iniciá otra visita de prueba de Rosa con el teléfono conectado y dejá abierto el formulario en curso. No escribas notas ni pulses **Finalizar visita**.
2. Desactivá Wi-Fi/datos unos 15 segundos sin cerrar ni recargar la página. No intentes guardar mientras esté desconectado.
3. Restablecé la conexión. Cuando el sitio vuelva a estar disponible, abrí **Hoy** y comprobá que la visita siga **En curso**. Pulsá **Continuar** y luego **Anular inicio accidental**.
4. Esto prueba recuperar una visita ya guardada antes del corte, no una respuesta perdida durante un guardado ni sincronización offline. No cortes la conexión mientras guardás: ese caso requiere un test controlado para evitar duplicaciones o estados inciertos.

**D. Segunda passkey, revocación y recuperación — en este orden**

1. Conseguí un autenticador independiente del que ya tiene la passkey `Moto G15`, por ejemplo una llave de seguridad o un dispositivo que no sincronice esa misma credencial. No repitas el alta en el Chrome/almacén que devolvió `InvalidStateError`.
2. En una sesión que conserve acceso, abrí `https://dev-pc.local:3000/configuracion/dispositivos`, elegí **Agregar passkey** y completá tú el PIN/biometría del autenticador independiente. Usá una etiqueta reconocible, como `llave-prueba`. Confirmá que figuren dos passkeys; si no, detenete y no revoques ninguna.
3. En una ventana privada o navegador del autenticador nuevo, ingresá por `/ingresar` con esa passkey y confirmá que llegás a `/inicio`. Conservá abierta la sesión original como respaldo.
4. Desde la sesión de control, revocá solo `llave-prueba`. Comprobá que desaparezca, que siga la passkey original `Moto G15` y que la revocada ya no permita ingresar. Nunca revoques la última passkey.
5. **Solo si tienes el autenticador independiente listo y los códigos anteriores guardados fuera del teléfono**, abrí una ventana privada y entrá a `https://dev-pc.local:3000/recuperar` (también aparece como **Usar un código de recuperación** desde `/ingresar`). Introducí el código guardado directamente en la app y completá tú el alta de la passkey nueva. Este paso reemplaza las passkeys y revoca las sesiones actuales.
6. Guardá el conjunto nuevo de códigos fuera del teléfono y pulsá **Ya los guardé**. Ingresá con la nueva passkey, confirmá `/inicio` y que la sesión anterior ya no sirva. No intentes reutilizar los códigos anteriores. Si algo falla a mitad de recuperación, detenete y anotá solo el error no sensible.

**E. Expiración de sesión:** no existe una prueba automatizada específica identificada y la actividad renueva el plazo. No cambies el reloj ni la base de autenticación. Una prueba física necesita mantener una sesión sin actividad durante 30 días; queda pendiente de una validación automatizada determinista.

Al terminar, compartí solo qué pasos pasaron y cualquier texto de error no sensible. Nunca compartas datos de autenticación ni una captura de la pantalla de recuperación.

**Finaliza cuando:** todos los escenarios acordados funcionan o tienen una decisión explícita sobre el riesgo residual. El acceso y la revocación de sesión pasaron. La prueba de autenticador independiente queda diferida por decisión de la persona; no se considera aprobada. La recuperación completa y revocación de segunda passkey no se pueden validar aún, y la expiración de sesión sigue pendiente. Esta etapa es requisito de **Núcleo estable**.

## Hito — Núcleo estable; habilita nuevas funciones

Se alcanza al cerrar las etapas 1 a 3: flujos ficticios integrados y reproducibles, build aprobado, autenticación comprobada en los dispositivos y ningún problema abierto que pueda causar acceso indebido, pérdida/duplicación de registros o bloqueo de atención. Los pendientes no críticos quedan escritos con responsable y condición de cierre.

## Etapa 4 — Elegir y construir la siguiente capacidad

**Objetivo:** priorizar con evidencia de uso diario, empezando por la menor capacidad que elimine una carga real. **Prioridades acordadas por la persona (2026-09-29):** resumen de una visita para la familia como texto para WhatsApp (implementado y validado), y como siguiente informe, evolución de un período.

- Mantener por ahora el alta directa de tratamiento; reabrir `ServiceRequest` solo si se confirma que recibir/revisar derivaciones es parte del ingreso cotidiano. Comparar con `/admin` antes de planificar su retiro.
- **Resumen familiar elegido e implementado:** se deriva de una visita finalizada, permite editar el texto antes de compartir, prepara el borrador en WhatsApp y no persiste una copia formal ni modifica la nota fuente.
- **Períodos e informes implementados (29/09/2026):** informe breve por cupo, determinista y editable antes de guardar; definitivo con PDF y trazabilidad después. Bloqueo de nuevas visitas al completar cupo, renovación, cierre parcial, finalización y reemplazos con original conservado. El contrato está en `docs/periodos-informes.md`.
- **Cierre pendiente del incremento:** ejecutar el recorrido físico nuevo descrito en `docs/pruebas-fisicas-periodos.md` en Ubuntu y Moto G15. Las comprobaciones automáticas y limitaciones están registradas por separado en el audit.
- **Después de ese cierre:** priorizar PWA/offline y respaldos protegidos de borradores según la necesidad cotidiana; completar requisitos de destinatarios y el hito de uso real. No añadir firma digital ni formatos específicos de una obra social sin sus requisitos verificados.

**Aceptación por etapas del incremento:**

1. Períodos, conteo, reserva, bloqueo y adaptación de legados: aceptación automática; renovación exige informe vigente, incluso en pruebas con dobles.
2. Borrador, guardado atómico, PDF local de producción, integridad y descarga autenticada: aceptación automática; borradores temporales sin respaldo local.
3. Cierre parcial, finalización, diferencias de fuentes y reemplazos concurrentes: aceptación automática; recorrido físico Ubuntu/Moto pendiente.

El recorrido completo se implementó para pruebas ficticias. El incremento no se declara cerrado físicamente ni habilita datos reales hasta completar sus condiciones correspondientes.

**ServiceRequest:** no es dependencia del informe ni del flujo clínico actual. El alta vigente crea paciente y tratamiento directamente, sin solicitud previa; la documentación de producto y el adaptador lo describen como decisión explícita. Recomendación provisional: mantener ese flujo para V1 y añadir gestión de solicitudes solo si el uso diario requiere recibir, revisar o aceptar derivaciones antes de iniciar tratamiento. Antes de retirar `/admin`, habrá que hacer esa comparación con la operación real; el código del `/admin` anterior no está presente en este repositorio, así que la auditoría actual no puede certificar su cobertura funcional.

Offline requiere diseño de seguridad antes de persistir clínica en un dispositivo y permanece postergado. No implementar todo el alcance V1 por defecto.

**Finaliza cada capacidad cuando:** tiene necesidad confirmada, contrato y límites claros, datos ficticios cubiertos por pruebas y recorrido revisado en dispositivos pertinentes.

## Etapa 5 — Preparar uso real privado

**Objetivo:** aprobar separadamente el uso de datos reales.

- Definir HTTPS y acceso privado, aislamiento verificable entre ficticio/demo y real, secretos, logs mínimos y respuesta ante dispositivo perdido.
- Probar backup y restauración protegidos sobre una copia controlada; acordar frecuencia, retención y responsable operativo.
- Completar compatibilidad de lectura y escritura con datos previos mediante copia segura y controlada, sin usar fixtures o capturas reales en el repositorio.
- Si se incorpora offline, completar cifrado/protección local, expiración, borrado y recuperación de sincronización antes de habilitar clínica real.
- Revisar y cerrar cada requisito aplicable de `docs/privacy.md` con evidencia.

**Finaliza cuando:** seguridad, compatibilidad, recuperación, dispositivos y operación privada están comprobados en el entorno previsto. El audit actual no acredita ninguno de estos requisitos de manera completa.

## Etapa 6 — Corte desde `/admin`

**Objetivo:** decidir el reemplazo después de acordar la cobertura mínima.

- Aprobar la matriz de capacidades necesarias/postergables/excluidas, incluyendo la decisión de `ServiceRequest`, informes y resúmenes.
- Ejecutar regresión final y un ensayo de reversión; conservar `/admin` como respaldo hasta que ambos terminen.
- Cambiar el uso operativo solo con respaldo recuperable y procedimiento de vuelta probado.
- Retirar `/admin` del repositorio anterior en una tarea posterior, tras el corte y la verificación del respaldo.

**Finaliza cuando:** el producto nuevo cubre lo necesario para la operación acordada, los datos existentes se leen correctamente y el regreso al respaldo es practicable.

## Supuestos y límites

- No hay fecha fija ni obligación actual de migración operativa.
- Los datos de pruebas y desarrollo son ficticios y HAPI `8081` es el único destino permitido para pruebas/escrituras de este plan.
- El hito de núcleo estable permite empezar funciones; **no** autoriza por sí solo datos reales.
- Portal familiar, SaaS multiusuario, historia clínica integral y réplica offline total permanecen excluidos de V1 mientras no haya una nueva decisión.
