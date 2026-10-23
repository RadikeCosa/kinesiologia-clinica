# Preparación para uso real

**Actualizado:** 2026-10-15
**Estado:** trabajo inicial implementado sobre el entorno ficticio; el piloto real aún no está acreditado. Ramiro decidió evaluar una excepción acotada para el primer caso mientras el aviso omite el domicilio; la brecha queda visible y requiere seguimiento, sin presentarse como cumplimiento validado.

Este registro acompaña el piloto de consulta de servicio. No acredita validación legal, seguridad operativa ni aprobación para datos reales. No incluir información real en pruebas o documentación.

## Matriz de brechas

| Fuente | Brecha / evidencia esperada | Impacto | Prioridad | Bloquea primer caso | Bloquea datos reales | Responsable / mecanismo | Estado |
|---|---|---:|---:|---:|---:|---|---|
| Producto | Consulta única activa con control de versión y prueba concurrente contra HAPI | Alto | P0 | Sí | Sí | Aplicación/infraestructura; HAPI 8081 | Cerrada con evidencia ficticia: creación simultánea y cierre frente a edición entre clientes independientes; no acredita despliegue real |
| Producto / infraestructura | Serialización global de horarios ante dos agendas que guardan a la vez | Alto | P0 | Sí | Sí | `Schedule` coordinador versionado; transacción HAPI condicional y revalidación bajo lock | Cerrada con evidencia ficticia: dos clientes independientes serializan la escritura; una sola cita persiste y la otra recibe conflicto |
| Producto | Presupuestos por alcance, revisiones y aceptación ligada a contacto | Alto | P0 | Sí | Sí | Dominio, aplicación y UI | En curso: captura y precondiciones implementadas; faltan recorridos físicos |
| Producto | Agenda y registro de evaluación inicial sin tratamiento ni cupo | Alto | P0 | Sí | Sí | Dominio, agenda, infraestructura y UI | En curso: evaluación y transición atómica al tratamiento con período inicial verificadas en HAPI; falta recorrido físico |
| Ley 26.529 / política | Consentimiento clínico, representación y modificaciones trazables | Alto | P0 | Sí | Sí | Asesoramiento local y producto | Parcial: consentimiento se captura para evaluación y tratamiento; representación y anulaciones requieren validación adicional |
| Ley 25.326 | Aviso previo a cada titular, destinatarios, responsable, finalidad, campos y derechos | Alto | P0 | Sí | Sí | Responsable del tratamiento con asesoramiento local | Parcial: identidad, matrícula y correo definidos; Ramiro contempla omitir domicilio en primer piloto. La suficiencia del aviso y el fundamento de la excepción no están validados; destinatarios, texto, versión y constancias siguen pendientes |
| Ley 26.529 | Integridad, conservación, recuperación y copia completa en 48 horas | Alto | P0 | No | Sí | Producto y asesoramiento local | Abierta |
| Ley / consulta local | Alcance de conservación de consultas sin atención, inscripción y requisitos profesionales | Alto | P0 | No | Sí | Asesoramiento local | Abierta |
| Política propia | Retención y baja de consultas, logs, documentos, contingencia y respaldos | Alto | P0 | No | Sí | Responsable operativo | Abierta |
| Infraestructura | Proveedor/región, transferencias, HTTPS, secretos y separación de HAPI | Alto | P0 | No | Sí | Operación | Abierta; documentación declara entornos separados, falta verificación operativa |
| Política propia | Passkeys, recuperación, expiración y revocación ante pérdida del dispositivo | Alto | P0 | No | Sí | Pruebas físicas e infraestructura | Parcial: expiración de 30 días deslizante, revocación por sesión/passkey y códigos de recuperación de un uso están implementados; recuperación completa y segundo autenticador independiente siguen pendientes de prueba física |
| Operación | Procedimiento protegido cuando falta conexión | Alto | P0 | Sí | Sí | Definir custodia, transcripción y conciliación | Abierta |
| Producto | Solicitante, paciente, avisos y roles sin asumir parentesco/representación | Alto | P0 | Sí | Sí | Dominio/UI y asesoramiento local | Parcial: alta separada y autorización revocable con historial; faltan procedimiento local de representación y efecto operativo aprobado |

**Estados:** abierta, en curso o cerrada con evidencia. “En curso” no es aprobación. “Bloquea primer caso” se refiere al recorrido completo en la app; “bloquea datos reales” incluye el piloto con identificación real.

## Implementado en este incremento

- Consulta separada de paciente, tratamiento y visita; contacto con relación y roles.
- Alta progresiva autenticada, constancia inicial de aviso y próximo seguimiento.
- Autorización de comunicación a una persona identificada, con alcance, método, fecha y actor (paciente o representante con fundamento). La constancia no habilita cuentas ni acceso digital de terceros; el recorrido E2E usa solicitante familiar y paciente separado.
- Revocación de autorización conserva tanto la constancia original como el evento de revocación; el E2E valida otorgamiento y revocación por el paciente. Falta aprobar e implementar cómo se aplica a comunicaciones reales fuera de la app.
- Presupuestos por alcance con versiones, respuesta ligada al contacto y cierres trazables en la capa de aplicación.
- Cita de evaluación sin `treatmentId`, ligada a consulta y paciente; reprogramación conserva la cita reemplazada, y cancelación deja próximo seguimiento. Sus escrituras usan transacción FHIR con control de versión de paciente y consulta.
- Registro de evaluación inicial con consentimiento clínico explícito, notas y observaciones estructuradas; termina la cita, mueve la consulta a “evaluación realizada” y crea un `Encounter` sin `EpisodeOfCare`, todo en una transacción.
- Inicio de tratamiento desde evaluación realizada: exige presupuesto de tratamiento vigente aceptado, evaluación registrada y consentimiento clínico; crea tratamiento y primer período, conserva referencias a consulta/evaluación/presupuesto y libera el puntero de consulta activa atómicamente.
- Gestión de seguimientos en UI: reprogramar conserva la fecha anterior en el historial; completar y cancelar exigen resultado o motivo. El cierre presenta motivos cerrados, bloquea citas de evaluación abiertas y visitas en curso, y cancela seguimientos pendientes sin borrarlos.
- Exclusión de concurrencia: `Patient` sirve como punto de coordinación versionado; la creación/cambio de consulta actualiza paciente y `ServiceRequest` en una transacción con `If-Match`.
- Exclusión de concurrencia de agenda: un `Schedule` coordinador compartido con `If-Match` serializa creación/reprogramación de visitas de tratamiento y evaluaciones; el control de superposición corre dentro del lock y la cita se confirma en la misma transacción. El recurso debe aprovisionarse en cada servidor FHIR antes de habilitar agenda; el seed local solo lo crea en HAPI ficticio.
- El formulario no persiste borradores en el navegador y permanece limitado a HAPI ficticio `8081`.

La integración en `consultation-intake.fhir.integration.test.ts` comprueba en HAPI 8.8/R4 dos creaciones simultáneas desde clientes independientes: queda una consulta activa, la operación perdedora recibe un conflicto claro y no persiste otro `ServiceRequest`. También confirma en el servidor que iniciar tratamiento crea `EpisodeOfCare` y primer período, conserva las referencias de origen y elimina el puntero activo dentro de la transacción. Los ensayos nuevos bloquean el cierre ante una cita de evaluación confirmada y ante un `Encounter` en curso; en ambos casos consulta, cita y puntero activo quedan intactos. Una carrera entre cierre y reprogramación del seguimiento desde clientes independientes confirma que solo una escritura con la misma revisión vence y que la otra informa conflicto. Un corte simulado después del commit de HAPI recupera la misma consulta al reintentar y rechaza reusar la operación con contenido distinto. La agenda detecta citas cruzadas entre evaluación y tratamiento. Dos clientes independientes que intentan reservar a la vez quedan serializados por el `Schedule` versionado: se confirma una sola visita y la operación siguiente vuelve a comprobar el horario y recibe el conflicto. El E2E de escritorio también comprueba el aviso ante una superposición que requiere confirmación explícita.

En Ubuntu, los E2E de escritorio en Chrome pasaron 17/17 en el puerto de prueba 3101, y el flujo actualizado de autorización y revocación a terceros pasó focalmente 1/1. La descarga PDF usa el origen del navegador, así que el test no depende del puerto 3100. Se ajustaron expectativas para que no dependan del número acumulado de visitas ficticias previas en el HAPI persistente. La integración HAPI completa pasó 24/24 en seis archivos, incluyendo una reproducción determinista de la carrera global de agenda; la suite unitaria quedó en 139 aprobadas. No se ejecutaron pruebas mobile por decisión de la persona; queda pendiente el recorrido físico en Moto G15.

## Revisión de privacidad y operación (alcance de esta auditoría)

**Decisión operativa de la persona profesional (2026-10-15):** para el primer piloto contempla trabajar con datos reales sin informar un domicilio en el aviso; más adelante cargará el domicilio de forma privada. El domicilio real no debe publicarse en web, repositorio, capturas, documentación ni material público. Esta decisión expresa una preferencia de privacidad, pero no cierra la brecha del aviso: la orientación oficial de AAIP incluye el domicilio del responsable entre la información previa. Antes del piloto, dejar documentado qué información se comunicará efectivamente al titular y registrar la revisión local pendiente; no describir el aviso como aprobado ni afirmar cumplimiento por esta excepción. El nombre, matrícula y correo profesional constan en el borrador local de revisión, nunca en assets públicos.

La inspección del código confirma sesiones individuales con expiración deslizante de 30 días, revocación de una sesión y revocación de las sesiones asociadas al eliminar una passkey. La recuperación usa códigos de un solo uso y revoca todas las sesiones anteriores. La app configura un único `FHIR_BASE_URL` del lado del servidor; las pruebas de este incremento rechazan cualquier endpoint distinto de HAPI ficticio `localhost:8081`.

Esta evidencia no verifica dónde vive el SQLite de autenticación, quién puede leer backups, la región del proveedor, dominio/HTTPS de producción, restauración, borrado/retención, contenido de logs, avisos legales ni el procedimiento de contingencia. No se inspeccionaron ni consultaron recursos de `8080`, secretos, registros clínicos reales o configuración privada. Esos puntos permanecen abiertos y bloquean datos reales hasta que se documenten y prueben en la infraestructura elegida; la revisión legal y los criterios sobre conservación/representación requieren asesoramiento local.

## Pendientes antes de completar el recorrido

- Validar correcciones/anulaciones trazables de la evaluación inicial y recuperar sus observaciones desde las pantallas clínicas.
- Definir con asesoramiento local cómo se verifica representación y cómo la revocación detiene comunicaciones por canales externos.
- Validar consentimiento clínico, representación y autorización a terceros según asesoramiento local.
- Aprovisionar el recurso coordinador FHIR versionado en el entorno operativo elegido y repetir allí la prueba concurrente antes de habilitar agenda con datos reales.
- Extender pruebas de fallo/reintento a edición de presupuestos y cambios de estado de la cita; el alta de consulta con respuesta de transacción perdida ya recupera el registro único en HAPI.
- Aprobar el aviso y las decisiones de conservación con asesoramiento local; validar inscripción, alojamiento/transferencias, copia clínica, retención de logs, backup/restauración y contingencia con evidencia.
- Revisar con asesoramiento local el guion y las decisiones abiertas del documento `revision-privacidad-y-representacion.md` antes de publicar el aviso o fijar plazos.
- Cerrar pruebas físicas pendientes de informes y autenticación.

## Secuencia

1. Confirmar contratos y cerrar el diagnóstico/matriz.
2. Resolver proveedor/región, dominio, HTTPS y passkeys antes del origen definitivo.
3. Completar consulta, presupuesto, evaluación inicial y tratamiento con datos ficticios.
4. En paralelo, cerrar privacidad, conservación, contingencia y asesoramiento aplicable.
5. Verificar concurrencia en HAPI, flujos físicos, exportación, respaldo/restauración y respuesta ante pérdida del dispositivo.
6. Habilitar el piloto con alcance mínimo y decisión operativa explícita sobre los riesgos residuales; registrar evidencia y no convertir esa decisión en una declaración de cumplimiento. La brecha legal del aviso permanece abierta hasta su validación.

Sin conexión se usa únicamente el soporte clínico protegido que se defina y apruebe; no se guardan notas personales en el teléfono.


## Incremento 23/10/2026

Consulta con contexto referido, pendientes en Inicio, enlace desde ficha y evaluación retrospectiva sin cita ni aceptación presupuestaria están implementados. El consentimiento clínico sigue siendo explícito y obligatorio; guardar evaluación no resuelve seguimientos automáticamente. Se preparó un modo privado deshabilitado. La inspección de infraestructura y los pasos de aceptación están en [piloto privado](piloto-privado.md). No se habilitaron datos reales ni se cerraron las brechas de privacidad u operación de esta matriz.


### Preparación operativa posterior

Se corrigieron publicación local de HAPI y permisos de configuración/respaldos. Un ensayo con datos ficticios verificó respaldo, restauración en volumen nuevo y persistencia al reiniciar PostgreSQL/HAPI; también respaldo online e integridad de una SQLite inventada. El entorno real permanece detenido y el piloto deshabilitado. La persona profesional confirmó que aún falta definir aviso y/o contingencia. Esta evidencia no cierra acceso/recuperación de cuenta real ni respaldo/restauración operativos; ver `piloto-privado.md`.

### Identificación del registro habitual

Se confirmó que el registro habitual son mensajes por WhatsApp al propio número. Se documentó en `piloto-privado.md` un procedimiento propuesto de transcripción y conciliación, sin acceder al chat. Protección del dispositivo, sesiones vinculadas, respaldo, recuperación y alternativa ante pérdida permanecen sin verificar. La contingencia continúa abierta; no se considera aprobada por identificar el canal.

### Respaldo de autenticación configurada

Se completó respaldo online y comprobación de integridad/restauración aislada de la base de acceso configurada, fuera del repositorio y con permisos privados. No se alteraron sesiones ni códigos. La evidencia de configuración y custodia se conserva privadamente; la recuperación física sigue pendiente. Ver evidencia y límites en `piloto-privado.md`.

### Verificación operativa posterior del servidor privado

Se verificaron capacidades y acceso exclusivamente local del servidor privado, respaldo FHIR fuera del repositorio y restauración en PostgreSQL temporal sin red, conservación de esquema/índices y persistencia del coordinador tras reiniciar PostgreSQL/HAPI. Se mantuvo el volumen operativo original. Las nuevas herramientas operativas exigen argumentos explícitos y no sustituyen los tests/seeds ficticios de 8081. El servidor privado quedó funcionando; la app continúa en modo ficticio. La persona profesional decidió conservar su passkey y diferir la recuperación física; confirmó guarda de códigos y uso exclusivo de Ubuntu. El aviso de tratamiento de datos sigue pendiente para habilitar el piloto. Ver alcance y evidencia en `piloto-privado.md`.
