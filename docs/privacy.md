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

- autenticación;
- sesión persistente con expiración razonable;
- revocación de dispositivos;
- HTTPS privado;
- almacenamiento offline protegido;
- separación técnica entre demo y real;
- backup y restauración;
- revisión de logs;
- comportamiento ante pérdida y recuperación de conexión.
