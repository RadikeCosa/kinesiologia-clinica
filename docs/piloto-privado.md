# Consulta inicial y preparación del piloto privado

## Recorrido implementado

La consulta permite una síntesis referida de hasta 2.000 caracteres. Si hay motivo, debe elegirse fuente: paciente, familiar o profesional. No representa una evaluación profesional. Teléfono y domicilio siguen siendo opcionales.

Inicio muestra «Consultas por atender» después de las visitas del día: hasta tres consultas con contactos de hoy o atrasados, o sin seguimiento pendiente ni evaluación agendada. Cada consulta aparece una vez; los contactos más antiguos se muestran primero. «Ver todas» abre `/consultas`, con el conjunto de consultas activas y su próximo paso, incluidos los contactos futuros y las evaluaciones propuestas o confirmadas. La hora de referencia se toma al cargar; no se actualiza automáticamente. La ficha conserva el enlace a la consulta activa. Este bloque no sustituye la integración pendiente de evaluaciones en la agenda principal.

La evaluación ya realizada puede registrarse sin cita ni presupuesto aceptado, con horarios efectivos y consentimiento explícito anterior o igual al inicio. Si hay cita abierta debe vincularse y confirmarse su resolución (o resolverse antes); la fecha debe coincidir. No se inventan horarios acordados. Las citas de evaluación admiten duraciones enteras de 15–240 minutos, incluidos 50.

Guardar evaluación conserva presupuestos y seguimientos, cambia la consulta a evaluación realizada y no inicia tratamiento ni consume cupos. Para iniciar tratamiento se mantienen presupuesto de tratamiento aceptado y consentimiento específico. La narrativa de evaluación y el plan usan sus propios campos; el editor compartido incorpora solo observaciones, síntomas y procedimientos opcionales. La transacción incluye consulta, consentimiento, evaluación, observaciones y eventual cita. Reintentar la misma operación recupera el registro; contenido distinto o versión obsoleta provoca conflicto.

## Modo privado preparado, deshabilitado

El valor predeterminado es `CLINICAL_MODE=fictional` con HAPI `http://localhost:8081/fhir`. El modo privado exige conjuntamente `CLINICAL_MODE=pilot`, `CLINICAL_PILOT_READY=yes`, HAPI exactamente `http://localhost:8080/fhir` y origen de autenticación localhost/127.0.0.1. Vercel permanece bloqueado. Una combinación ambigua no habilita la superficie clínica. El indicador de la interfaz cambia a “Piloto privado · Registro complementario” únicamente en ese modo.

`CLINICAL_PILOT_READY` es una declaración operativa explícita, no una comprobación automática de seguridad ni aprobación legal. No se configuró ni habilitó en este incremento. No ejecutar pruebas, seeds, screenshots, exportaciones de demostración o limpiezas contra 8080.

## Evidencia y bloqueos al 23/10/2026

- Inspección del archivo Compose del entorno real: PostgreSQL 16, HAPI 8.8.0-1 y volumen de datos independiente del entorno descartable.
- El puerto estaba publicado como `8080:8080`. En la preparación operativa se corrigió a `127.0.0.1:8080:8080` y se verificó también esa configuración en el contenedor HAPI recreado sin iniciarlo.
- La inspección de Docker por proyecto `hapi-prod` no encontró servicios ejecutándose. HAPI se recreó detenido para aplicar el puerto restringido; PostgreSQL continúa detenido, con el volumen original. No se consultaron historias ni se inició el entorno real.
- No se consultaron historias, archivos de secretos ni respaldos reales. No hay evidencia de acceso, reinicio, respaldo/restauración o recuperación de sesión en el entorno piloto.
- Las brechas de avisos, representación, conservación y contingencia de `preparacion-uso-real.md` siguen abiertas. Los alias no convierten los hechos clínicos en ficticios.

## Secuencia operativa para habilitar

1. Resolver exposición de red y verificar configuración y permisos de datos/autenticación en el entorno elegido. Mantener los secretos fuera del repositorio. Las modificaciones de infraestructura se realizan en su proyecto, sin reemplazar ni limpiar volúmenes.
2. Registrar aviso aplicable, constancias necesarias y procedimiento de contingencia; conservar el registro clínico habitual como principal. Cerrar las condiciones necesarias de privacidad pendientes con evidencia.
3. Aprovisionar el coordinador de agenda versionado mediante un procedimiento específico para ese entorno; nunca ejecutar el seed de demo.
4. Habilitar una validación controlada usando exclusivamente un registro inventado. Verificar acceso, guardar y recuperar consulta/evaluación tras reiniciar la aplicación y el servicio sin borrar volúmenes; comprobar cierre y recuperación de sesión.
5. Respaldar de forma protegida FHIR y autenticación; restaurar en un destino aislado, sin sobrescribir el servidor operativo ni dejar exports en el proyecto. Verificar que las relaciones, notas y observaciones del registro inventado se recuperan. Documentar el resultado sin copiar payloads ni datos.
6. Solo con esas evidencias declarar el entorno listo y comenzar el piloto complementario. Paciente y familiares usan alias; correspondencia con identidades queda fuera de la aplicación bajo custodia profesional. No cargar identificadores, mensajes originales ni detalles personales innecesarios.

Para registrar dificultades, usar descripciones genéricas como “no encontré la consulta pendiente” o “tuve que repetir el plan”. Nunca incluir contenido clínico, capturas o exports del caso real en el repositorio. La agenda unificada de evaluaciones, sus series longitudinales y la transferencia editable del plan siguen pendientes de otro incremento.

## Verificación del incremento

- Lint y build con `FHIR_BASE_URL=http://localhost:8081/fhir`: aprobados.
- Suite unitaria: 148 pruebas aprobadas; integración omitida en esa ejecución por diseño.
- Integración HAPI ficticio: 25 pruebas aprobadas, incluida evaluación sin cita, concurrencia y recuperación de reintento.
- Tres escenarios focales de Chrome de escritorio aprobados: seguimiento y cierre; evaluación retrospectiva sin presupuesto/cita y recuperación con sesión válida; cita y reprogramación de 50 minutos. Se revisó visualmente una captura del caso inventado, fuera del repositorio.
- La prueba de sesión retira cookies para comprobar el bloqueo y restaura una sesión válida; no acredita recuperación física con passkey ni reinicio/restauración del entorno real. Estas aceptaciones siguen pendientes.
- Regresión adicional de Inicio y visitas en Chrome de escritorio: 12/12 aprobadas, incluido inicio, continuación, finalización y anulación de visitas con el editor compartido.


## Preparación operativa verificada el 23/10/2026

- Archivo Compose y contenedor real HAPI preparados con publicación exclusiva en loopback. Se comprobó `HostIp=127.0.0.1` y puerto 8080 con el contenedor detenido. Falta verificar el listener cuando se autorice e inicie la validación operativa.
- Archivos de configuración privada de PostgreSQL y HAPI: modo 0600. Directorio de respaldos de infraestructura: modo 0700. No se leyeron sus contenidos ni respaldos reales.
- Directorio local de autenticación: 0700; archivos SQLite observados, incluidos WAL/SHM: 0600. Esta inspección verifica permisos, no recuperación de la cuenta.
- Ensayo reproducible `FHIR_BASE_URL=http://localhost:8081/fhir node scripts/rehearse-private-backup.mjs`: aprobado. Usa exclusivamente la base ficticia de `hapi-dev`, crea PostgreSQL 16/HAPI 8.8.0-1 con red y volumen nuevos, restaura el respaldo y compara paciente, consulta, visita y observación inventados. Reinicia PostgreSQL y HAPI y vuelve a comparar los recursos.
- También verificó `integrity_check` y conservación de registros de sesión/passkey inventados usando la API online de SQLite. La base inventada tiene un esquema mínimo de ensayo; no es un respaldo de la cuenta real ni una prueba de ingreso con passkey.
- La copia ficticia, su hash y la evidencia quedan en `.local/backup-rehearsals/`, ignorados por Git, con directorios 0700 y archivos 0600. Contenedores, red y volumen del ensayo se eliminaron. Las primeras ejecuciones detectaron una particularidad de puertos temporales de Docker al reiniciar; la versión corregida terminó todas las comprobaciones.
- Lint y revisión de whitespace aprobados para la herramienta. El README de infraestructura ya describe el ensayo aislado y retira el ejemplo de restauración destructiva sobre el servidor real.

La persona profesional confirmó que aún falta definir al menos uno de los dos elementos: aviso de tratamiento de datos y soporte protegido del registro habitual. No se da por cerrado ninguno sin evidencia específica. El consentimiento clínico confirmado previamente es un acto separado y no se vuelve a solicitar aquí.

**Pendientes para la habilitación:** completar aviso/contingencia; verificar acceso y recuperación de la cuenta profesional; aprovisionar el coordinador; ensayar persistencia y respaldo/restauración del entorno operativo en destino aislado con su procedimiento aprobado. No se accedió a historias ni se realizaron exports de 8080. Los permisos locales verificados no acreditan cifrado ni respaldo externo. `CLINICAL_PILOT_READY` permanece sin habilitar.

## Registro habitual y contingencia: WhatsApp personal

La persona profesional confirmó que su registro habitual consiste en enviarse mensajes por WhatsApp a su propio número. No se accedió al chat ni se copiaron mensajes, contactos o información clínica. Se confirmó una sesión de WhatsApp Web en Ubuntu; no se verificó la lista completa de dispositivos vinculados. Este dato identifica el circuito actual; no acredita que el canal sea un soporte protegido aprobado ni un respaldo recuperable.

Procedimiento propuesto para el piloto, pendiente de validar la protección y recuperación del soporte:

1. Mantener el registro habitual como principal durante el piloto complementario. Si falla la app, identificar la atención pendiente de transcripción mediante un alias y su fecha efectiva, sin incorporar identificadores nuevos al circuito del piloto.
2. Al volver a Ubuntu, abrir la consulta por alias y revisar si la evaluación o visita ya quedó guardada antes de reintentar. Una respuesta perdida no significa necesariamente que el guardado falló.
3. Transcribir una síntesis profesional al formulario correspondiente con horarios efectivos. No pegar conversaciones ni cargar automáticamente avisos, aceptación de presupuesto o consentimiento. Consignar cada constancia según lo ocurrido.
4. Volver a abrir el registro guardado y comprobar consulta/paciente, fecha, horarios, evaluación y plan. Solo entonces marcar en el registro habitual que la transcripción fue comprobada. Si hay diferencias, mantenerlo pendiente para conciliación.
5. Registrar problemas de uso en el proyecto únicamente mediante descripciones genéricas sin contenido clínico.

Para aprobar el soporte faltan comprobaciones de bloqueo y acceso al dispositivo/aplicación, notificaciones, dispositivos vinculados, protección del respaldo y recuperación mediante información inventada. También falta definir qué hacer ante pérdida del dispositivo o falta de acceso a WhatsApp; no se supone que esté disponible ante cualquier falla. No se fijaron plazos de conservación ni una política de borrado de mensajes. El ensayo de restauración FHIR/SQLite no verifica WhatsApp.

El aviso de tratamiento de datos sigue pendiente de cierre. Identificar este registro habitual no habilita `CLINICAL_PILOT_READY` ni cierra por sí solo la contingencia.


### Evidencia privada de acceso

Las preferencias de bloqueo, sesiones vinculadas y configuración de mensajería de los dispositivos se conservan fuera de Git. Su inspección técnica no acredita recuperación física ni aprobación de contingencia. No se cambian preferencias del sistema como continuación automática de este trabajo.

## Respaldo de la cuenta configurada y recuperación pendiente

Las herramientas de respaldo operativo requieren `PRIVATE_BACKUP_ROOT` con una ruta absoluta fuera del repositorio y su argumento de confirmación correspondiente. Crean los subdirectorios `auth/` o `fhir/`; no incorporan rutas personales al código. Configurar esa variable privadamente antes de usarlas. La consolidación de Git no ejecuta respaldos operativos ni accede a 8080.

Se autorizó y ejecutó el respaldo de la base de autenticación configurada para el origen local. La herramienta `node scripts/backup-auth-store.mjs --confirm-private-backup` carga la configuración del servidor sin imprimir valores privados, abre la base en modo solo lectura y usa la API online de SQLite. No contiene endpoints FHIR ni consulta historias.

El respaldo y una copia de verificación restaurada quedaron fuera del repositorio, bajo el directorio privado `backups/auth/` del proyecto de infraestructura. La integridad SQLite fue correcta y las huellas del contenido de las tablas de cuenta, passkeys, desafíos, sesiones y códigos coincidieron entre respaldo y copia restaurada. Directorios 0700 y archivos 0600. No se sobrescribió la base activa ni se consumieron códigos o revocaron sesiones.

La configuración concreta de credenciales, sesiones y códigos se conserva fuera de Git. El respaldo acredita integridad de la copia, no posesión de códigos ni independencia de otro autenticador. La renovación y custodia se verifican por la persona profesional sin compartir códigos con el agente.

La recuperación real registra una nueva passkey, consume el código utilizado, renueva los códigos y revoca las sesiones previas según el código de la aplicación. Por ese motivo no se ejecuta como una comprobación de solo lectura. La prueba física debe realizarse con la persona profesional presente, con el respaldo verificado y un método alternativo efectivamente disponible; luego debe comprobar ingreso y registro de las nuevas constancias sin exponer códigos. La copia local protegida no acredita una copia externa, cifrado de disco ni recuperación ante pérdida de la computadora.


### Renovación guardada y prueba física preparada

La persona profesional confirmó haber terminado la renovación y guarda de códigos desde la interfaz. Después se creó otro respaldo de autenticación y se verificaron integridad y restauración aislada; no se consumieron códigos ni cambiaron sesiones durante ese respaldo. La prueba física de recuperación está preparada en una pestaña separada, pendiente de ejecución por la persona profesional, sin compartir códigos con el agente.

Al completar la recuperación, el flujo reemplaza todas las passkeys anteriores por la nueva, revoca sesiones previas y genera otro juego de códigos que sustituye al recién guardado. La recuperación física todavía no se da por aprobada. Después de completarla se debe guardar el juego definitivo, comprobar un ingreso nuevo y actualizar nuevamente el respaldo de acceso.


### Decisión de conservar el acceso actual

La persona profesional decidió conservar la passkey que funciona y diferir la prueba física completa de recuperación. Confirmó la guarda de los códigos renovados. Se abrió el formulario de recuperación para preparar la prueba, pero no se confirmó su ejecución: no se da por reemplazada la passkey ni por consumido un código. El respaldo posterior a la renovación está verificado. No ejecutar recuperación, revocación, nueva rotación ni registro de credenciales como continuación automática de este trabajo.

El diferimiento se registra como aceptación de una comprobación pendiente, sin presentarla como aprobada. La preparación del piloto puede continuar con la evidencia disponible y sus demás condiciones; no se solicitará repetir esta decisión. El entorno clínico real sigue deshabilitado: faltan las condiciones operativas y de privacidad ya documentadas. Mientras se reúne la evaluación de la visita, el registro habitual continúa siendo el principal.

## Estado vigente después de la verificación operativa

Se autorizó completar las comprobaciones técnicas con la menor intervención manual posible. La revisión previa de servicios detenidos quedó superada por esta ejecución:

- Se iniciaron PostgreSQL y HAPI privados conservando el volumen `hapi-prod_hapi-postgres-prod-data`. HAPI está publicado exclusivamente en `127.0.0.1:8080` y su endpoint de capacidades responde. La aplicación de desarrollo no cambió de modo ni de servidor FHIR.
- Se creó un respaldo operativo FHIR mediante `scripts/verify-private-fhir-backup.mjs --confirm-private-fhir-backup`. El archivo comprimido y su hash/evidencia permanecen fuera del repositorio, en `backups/fhir/` del proyecto de infraestructura, con directorios 0700 y archivos 0600. No se imprimieron credenciales ni payloads clínicos.
- Se restauró esa copia en PostgreSQL temporal, con red deshabilitada y almacenamiento temporal propio, nunca sobre el volumen operativo. `pg_restore --exit-on-error` terminó correctamente; se comprobó existencia de tablas de esquema y ausencia de índices inválidos mediante el catálogo, sin seleccionar historias. El destino temporal se eliminó.
- Se aprovisionaron únicamente Device y Schedule del coordinador con `scripts/provision-private-agenda.mjs --confirm-private-agenda`: creación condicional para no sobrescribir recursos existentes, sin seeds ni altas de pacientes/visitas.
- Después se reiniciaron PostgreSQL y HAPI de forma controlada. Se verificaron capacidades, publicación local, conservación del volumen y persistencia del coordinador versionado. Un segundo respaldo posterior al reinicio y al aprovisionamiento también se restauró correctamente en destino aislado.
- Ambas herramientas rechazan ejecución sin su argumento explícito. Lint y revisión de whitespace aprobados. No se modificaron passkeys, códigos ni sesiones.

Esta verificación no es una restauración de la aplicación completa con un paciente ni acredita almacenamiento cifrado o copia externa. El respaldo de acceso se validó por separado y la prueba física de recuperación se difirió por decisión explícita de la persona profesional. Para restaurar una cuenta en el futuro debe contemplarse que una copia anterior también conserva el estado anterior de sesiones, passkeys y códigos: no reponerla sobre la cuenta activa como ensayo.

La persona profesional informó uso exclusivo de Ubuntu y decidió mantener sus preferencias de bloqueo sin cambios. Se respeta esa decisión; no se agrega un cambio de bloqueo de escritorio como requisito automático. El registro habitual y la guarda de códigos están confirmados. Permanece pendiente el cierre del aviso de tratamiento de datos antes del uso real. `CLINICAL_PILOT_READY` no se habilitó, no se incorporó el caso real ni se cambió el origen del navegador. Mientras se obtienen los datos de la visita se continúa con el registro habitual.


### Aviso preparado privadamente

Se preparó una propuesta completa de aviso en `.local/aviso-datos-piloto.md`, ignorada por Git y con modo 0600, para completar y revisar sin publicar datos privados. Incluye responsable y contacto conocidos, finalidades, categorías y necesidad de datos, alias, almacenamiento local, mensajería y respaldo externo declarados, destinatarios, derechos, constancias y fuentes oficiales. Quedaron dos campos sin inventar: domicilio profesional y servicio de respaldo de WhatsApp. No se requieren contraseñas, códigos ni datos de cuenta para completarlos. No se considera comunicado/aprobado por generar el archivo y no se habilitó el piloto. La revisión de adecuación, especialmente de servicios externos y conservación, no se presenta como acreditada.
