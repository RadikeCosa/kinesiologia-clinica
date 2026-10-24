# Flujo de Git para la revisión UX/UI

Acuerdo del 23 de octubre de 2026: conservar el trabajo previo necesario, retirar contenido sobrante o privado y consolidar la base en `main` antes de comenzar la revisión visual. No iniciar todavía la primera ronda de implementación.

## Estado de partida

- `main` y la referencia local `origin/main` apuntaban a `8bba07b`.
- Había 44 archivos versionados modificados y 27 archivos nuevos antes de crear este documento; nada preparado para commit.
- La rama `codex/ux-patient-baseline` apuntaba al mismo commit y no respaldaba el trabajo sin guardar.
- Los cambios previos abarcan consultas, coordinación de agenda, preparación del piloto y documentación. El rediseño acordado de Hoy todavía no está implementado.
- La consulta inicial del remoto falló por restricciones de red. Un `fetch` posterior autorizado terminó correctamente y confirmó que `main` no tenía diferencias con `origin/main` antes de consolidar.

## Preparación de la base

1. Preservar una copia local restringida de los archivos modificados y nuevos, sin incluir configuración privada, bases, respaldos ni exportaciones. Crear la rama de preparación `codex/checkpoint-pre-ux`.
2. Revisar cambios existentes y conservar el incremento funcional de consultas, evaluaciones, agenda y modo piloto deshabilitado, junto con sus pruebas y contratos. Conservar la auditoría y sus pendientes; no declarar resueltos defectos que esta consolidación no modifica.
3. Reemplazar datos personales en el borrador de privacidad por campos genéricos. Conservar los datos concretos únicamente en el material privado. Retirar de la documentación versionada detalles del estado de credenciales y preferencias de acceso de dispositivos.
4. Sustituir rutas personales de respaldo escritas en código por `PRIVATE_BACKUP_ROOT`, configurado fuera del repositorio. No ejecutar las herramientas operativas durante la consolidación.
5. Ejecutar comprobaciones, revisar el índice y guardar la base funcional y el seguimiento UX/UI en commits separados.
6. Volver a `main` e integrar con avance rápido (`--ff-only`). Una divergencia obliga a revisar el historial antes de continuar; no se fuerza ni se resetea la rama.
7. Confirmar que el directorio de trabajo quede limpio en `main`. La publicación en GitHub es un paso distinto y no se ejecuta automáticamente como parte de esta consolidación local.

## Trabajo a partir de main

- Iniciar cada ronda desde la base integrada de `main`, en una rama corta `codex/`, por ejemplo `codex/ux-hoy-ronda-1`. Crear esa rama cuando comience la implementación, no durante la consolidación.
- Usar una rama por ronda o cambio coherente y commits pequeños que describan el resultado.
- Revisar el diff antes de preparar y confirmar cambios. Seleccionar archivos o fragmentos explícitamente; evitar agregar indiscriminadamente todo el directorio de trabajo.
- Separar UX/UI de cambios clínicos, de privacidad o infraestructura ajenos a la ronda.
- Ejecutar comprobaciones pertinentes al alcance. Las pruebas, seeds y limpiezas automatizadas usan únicamente FHIR 8081.
- Actualizar el seguimiento UX/UI distinguiendo acuerdo, implementación, validación automatizada y aceptación visual. La prueba física en G15 se registra por separado.
- Revisar el resultado y el diff antes de integrar. Si se publica una rama, usar PR contra `main`, con alcance y validación explícitos; adjuntarlo al chat.
- Antes de integrar, actualizar la referencia remota y resolver conflictos en la rama de trabajo. No reescribir commits compartidos, forzar pushes ni descartar trabajo local.
- Un checkpoint o una suite aprobada no acredita preparación para datos reales ni aceptación física. El modo piloto permanece deshabilitado.

No se necesitan ramas permanentes `develop` o `release` para esta revisión. Se mantiene `main` como punto de partida y se aísla cada ronda antes de integrarla.

## Validación de la consolidación

Base funcional guardada en `62ba538` (`feat: consolidate consultation intake and disabled pilot baseline`). El seguimiento UX/UI y este procedimiento se guardan en un commit de documentación separado; ambos conforman el punto de partida local de `main`.

Comprobaciones del 23/10/2026 sobre la base revisada:

| Comprobación | Resultado |
| --- | --- |
| `npm run lint` | Aprobado |
| `npm run test` | 148 aprobadas; 25 de integración omitidas por diseño |
| `npm run test:integration:fhir` | 25/25 aprobadas contra 8081 |
| Build con FHIR 8081 y salida temporal `.next-baseline` | Aprobado, incluida comprobación TypeScript |
| E2E Chrome de escritorio, corrida completa final | 19/19 aprobadas |
| Sintaxis de las dos herramientas de respaldo ajustadas | Aprobada; no se ejecutaron respaldos operativos |
| Revisión de patrones sensibles en archivos nuevos/modificados | Sin coincidencias de correo, rutas personales absolutas, claves privadas o formatos de tokens buscados después de la limpieza; no sustituye una auditoría exhaustiva |

Incidencias preservadas como evidencia:

- La primera integración no pudo conectar por `EPERM` del sandbox; la repetición autorizada pasó completa.
- Una corrida E2E se interrumpió por un reinicio causado al comprobar la configuración. Una segunda aprobó 18/19, con un 404 después de renovar un período; la repetición focal de informes pasó 2/2 y la corrida completa final, sin compilación simultánea, pasó 19/19. La causa de ese 404 no se confirmó: queda como incidencia intermitente pendiente de investigar, no como defecto corregido ni como simple fallo de timeout.
- Se conserva `experimental.useTypeScriptCli: false`: retirarlo reprodujo `Could not parse output from TypeScript's --showConfig` con Next 16.3.5. El build aprobado mantiene la comprobación de tipos en proceso; no ignora errores de TypeScript.
- Las inclusiones temporales que Next agregó a `tsconfig.json` para `.next-baseline` se retiraron al terminar; no forman parte del contrato del proyecto.

La consolidación conserva los pendientes de la auditoría del 17/10 y de aceptación física. No se ejecutaron pruebas contra 8080 ni se habilitó el piloto. La revisión visual nueva sigue sin implementar.

## Publicación y comienzo de la ronda UX/UI

Por instrucción explícita del usuario, los commits de base se publicaron en `origin/main` hasta `7509b67`. Después se creó `codex/ux-hoy-ronda-1` desde esa base limpia. La nueva ronda se conserva en su rama para revisión visual antes de integrar; el push de la base no publica automáticamente el rediseño.

## Cierre de la primera ronda de Hoy

El 24/10/2026, después de confirmar que el recorrido funciona en el Moto G15, el usuario autorizó integrar la ronda completa en `main` local y remoto. La ronda incluye `962e9b5` (tarjetas y consultas por atender), `edda717` (precauciones visibles) y `cfb7545` (recorrido compartido y WhatsApp), más el registro de aceptación física.

La integración utiliza avance rápido desde la base `7509b67`, sin reescribir el historial. La validación del código de la ronda quedó registrada en [revisión UX/UI](revision-ux-ui.md): lint y compilación aprobados, 161 pruebas unitarias, 26 de integración y 46 de interfaz aprobadas en sus últimas corridas. Se conserva documentada la incidencia intermitente del historial de anulaciones; no se declara resuelta por esta ronda. Los cambios de cierre son únicamente de documentación y no requieren repetir las suites ya aprobadas.

La siguiente ronda parte de `main` actualizado, en una nueva rama corta `codex/`. Los checkpoints previos se conservan como respaldo local.
