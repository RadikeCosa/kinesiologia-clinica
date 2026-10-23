# Privacidad y entornos

## Reglas permanentes

- no versionar datos reales de pacientes, DNI, teléfonos, domicilios ni notas identificables;
- no guardar secretos, cookies, credenciales, exports o backups FHIR;
- usar exclusivamente datos ficticios en tests, documentación, screenshots y demo;
- no registrar payloads clínicos completos ni contenido de notas en logs;
- no incorporar analytics públicos a la aplicación privada;
- no exponer HAPI FHIR directamente al navegador ni a internet.

## Entornos

- **Desarrollo**: endpoint habitual `http://localhost:8081/fhir`, descartable y con datos ficticios.
- **Demo**: independiente, reiniciable y sin conexión posible a datos reales.
- **Real privado**: acceso restringido, HTTPS, backups protegidos y logs minimizados.

La pantalla inicial de consulta no es por sí sola un aviso de privacidad aprobado. Se definió como responsable a la profesional independiente, con domicilio profesional y correo profesional como canal de derechos; antes de recabar datos reales hay que consignar esos valores exactos, validarlos localmente y completar finalidades, destinatarios, campos obligatorios/facultativos, consecuencias y vías para ejercer derechos. Si consulta un familiar, informar al familiar sobre sus datos y al paciente sobre los propios antes de registrarlos; validar las excepciones y la representación aplicables.

El guion de revisión, las preguntas de representación y la matriz propuesta de conservación están en [revisión local de privacidad y representación](./revision-privacidad-y-representacion.md). Son material pendiente de asesoramiento; no deben presentarse a pacientes como política aprobada. El aviso debe versionarse y su constancia individual debe vincular sujeto, actor, carácter, fecha, método y texto efectivamente comunicado.

La aplicación utiliza un solo `FHIR_BASE_URL` server-side por ejecución. Si falta o es inválido, el sistema debe declararse `not_configured` y no inventar un endpoint.

## Antes de incorporar datos reales

Todavía deben existir y probarse:

- validación de autenticación, expiración, recuperación y revocación en teléfono y computadora;
- HTTPS privado;
- separación técnica entre demo y real;
- backup y restauración;
- revisión de logs;
- contingencia clínica protegida ante pérdida de conexión; no guardar notas en el teléfono;
- passkeys, recuperación y revocación ante dispositivo perdido.

Offline en la app no es requisito si existe un procedimiento clínico alternativo protegido, aprobado y probado. Si se agrega almacenamiento offline en la app, su cifrado, expiración, borrado y sincronización pasan a ser requisitos previos.

## Requisitos adicionales de informes antes de datos reales

El incremento permanece limitado al HAPI ficticio 8081. Un PDF descargado queda bajo la protección del dispositivo de quien lo descarga; los borradores de la aplicación no se almacenan en el navegador. No habilitar datos reales por haber aprobado el flujo ficticio.

El hito independiente debe definir y verificar identidad y matrícula profesional, requisitos de destinatarios/obras sociales, política de conservación, registro de accesos y emisiones, permisos de infraestructura, custodia de archivos descargados, backup protegido y restauración. Repetir el PDF desde el host y paquete definitivos. La inmutabilidad actual es una garantía de aplicación con comprobación de hashes; no impide que un administrador de HAPI cambie recursos y hashes conjuntamente.

La revisión pendiente debe contemplar custodia/conservación de historia clínica y protección de datos personales conforme a las normas aplicables, incluidas [Ley 26.529](https://www.argentina.gob.ar/normativa/nacional/ley-26529-160432/actualizacion) y [Ley 25.326](https://www.argentina.gob.ar/normativa/nacional/ley-25326-64790/actualizacion). Este documento registra condiciones de cierre; el incremento no acredita por sí solo cumplimiento normativo ni aprobación para el uso real.

También deben definirse plazo y fundamento para registros de actividad, documentos, material de contingencia y respaldos. Resolver con asesoramiento local la inscripción de la base, las transferencias internacionales y el alcance de conservación de consultas que no llegan a atención. En la entrega de copias, verificar por separado la identidad y legitimación de quien solicita, la autenticación de la copia y el canal seguro de entrega.

## Preparación del piloto local

Existe un modo privado explícito, deshabilitado por defecto y condicionado a aceptación operativa y de privacidad documentada en [piloto privado](piloto-privado.md). El modo ficticio, los tests, seeds y limpiezas siguen restringidos a 8081. Usar alias en el piloto no transforma hechos clínicos reales en datos ficticios y no autoriza incorporarlos al repositorio.
