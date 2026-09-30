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

La aplicación utiliza un solo `FHIR_BASE_URL` server-side por ejecución. Si falta o es inválido, el sistema debe declararse `not_configured` y no inventar un endpoint.

## Antes de incorporar datos reales

Todavía deben existir y probarse:

- validación de autenticación, expiración, recuperación y revocación en teléfono y computadora;
- HTTPS privado;
- almacenamiento offline protegido;
- separación técnica entre demo y real;
- backup y restauración;
- revisión de logs;
- comportamiento ante pérdida y recuperación de conexión.

## Requisitos adicionales de informes antes de datos reales

El incremento permanece limitado al HAPI ficticio 8081. Un PDF descargado queda bajo la protección del dispositivo de quien lo descarga; los borradores de la aplicación no se almacenan en el navegador. No habilitar datos reales por haber aprobado el flujo ficticio.

El hito independiente debe definir y verificar identidad y matrícula profesional, requisitos de destinatarios/obras sociales, política de conservación, registro de accesos y emisiones, permisos de infraestructura, custodia de archivos descargados, backup protegido y restauración. Repetir el PDF desde el host y paquete definitivos. La inmutabilidad actual es una garantía de aplicación con comprobación de hashes; no impide que un administrador de HAPI cambie recursos y hashes conjuntamente.

La revisión pendiente debe contemplar custodia/conservación de historia clínica y protección de datos personales conforme a las normas aplicables, incluidas [Ley 26.529](https://www.argentina.gob.ar/normativa/nacional/ley-26529-160432/actualizacion) y [Ley 25.326](https://www.argentina.gob.ar/normativa/nacional/ley-25326-64790/actualizacion). Este documento registra condiciones de cierre; el incremento no acredita por sí solo cumplimiento normativo ni aprobación para el uso real.
