# Revisión guiada de UX/UI

Inicio: 23 de octubre de 2026. Revisión conjunta, pantalla por pantalla, de la aplicación privada.

## Método y alcance

En cada pantalla se registran los problemas observados, las propuestas, los acuerdos y su validación. Primero se arma la lista de mejoras; después se implementan los cambios acordados por pantalla o bloque. Una propuesta no cuenta como aprobada ni un cambio implementado como validado.

La revisión se realiza desde la computadora y puede incluir vistas móviles. La comprobación física en Moto G15 queda pendiente: una captura móvil no acredita el uso en ese dispositivo. Usar únicamente datos ficticios y el entorno de desarrollo en 8081. Este documento no incorpora capturas ni datos de pacientes.

Estados: **En definición**, **Propuesto**, **Acordado**, **Implementado**, **Validado**. Cada cambio debe indicar por separado la evidencia de implementación y de validación cuando existan.

## Acuerdos transversales

- Definir reglas compartidas para tarjetas, jerarquía de información y diseño, y mantener coherencia entre pantallas.
- Conservar las diferencias entre paciente, consulta, tratamiento y visita al definir las variantes de tarjeta.
- Los valores concretos de tipografía, colores, espaciado y disposición todavía están por definir.

## Base de Git antes de implementar

Por decisión del usuario, primero se consolida el trabajo previo necesario en `main` y se deja el árbol limpio. El rediseño comienza desde esa base, en una ronda posterior. Ver [flujo de Git](flujo-git.md). La consolidación no implementa los acuerdos visuales de este documento.

## Hoy

### Observaciones iniciales

El usuario considera que las tarjetas con los nombres de pacientes no resultan claras ni estéticas. En la captura móvil revisada, las acciones principales tienen mucho peso visual y la lista de pendientes de días anteriores ocupa una gran extensión antes de llegar a las visitas del día. Las consultas abiertas también ocupan espacio por encima de la actividad diaria.

### Lista de mejoras

| ID | Cambio | Estado | Prioridad propuesta |
| --- | --- | --- | --- |
| HOY-01 | Mostrar primero las visitas de hoy y agrupar las pendientes de días anteriores en un bloque plegable con su cantidad. | Implementado | Alta |
| HOY-02 | Destacar nombre y horario; dejar el avance del tratamiento en un nivel secundario. | Implementado | Alta |
| HOY-03 | Mostrar la fecha original en cada visita pendiente para distinguir días diferentes. | Implementado | Alta |
| HOY-04 | Reducir el peso visual de los botones repetidos, conservando una acción principal reconocible. | Implementado | Media |
| HOY-05 | Mostrar el texto completo de las precauciones junto al nombre, sin desplegar ni abrir Más; quitar la franja inferior. | Implementado | Media |
| HOY-06 | Reemplazar el listado de consultas abiertas por «Consultas por atender», con seguimientos de hoy o atrasados y consultas sin próximo paso, según el criterio detallado abajo. | Implementado | Alta |
| HOY-07 | Mejorar separación de grupos de información y contraste de los textos secundarios. | Implementado | Media |
| HOY-08 | Permitir cerrar el panel «Más» al hacer clic o tocar el fondo oscurecido, conservando la X y Escape. | Implementado | Media |
| HOY-09 | En «Más», mostrar primero identidad y precauciones, luego acciones de visita y después contacto y ubicación. | Implementado | Alta |

HOY-01, HOY-02, HOY-04, HOY-05, HOY-06, HOY-08 y HOY-09 fueron acordados durante la revisión. La composición concreta de las tarjetas y la presentación de las opciones secundarias están descritas al final y se revisarán con el usuario sobre el resultado. HOY-03 y HOY-07 se incluyeron como apoyo a esa composición y al plegado de pendientes. Toda la ronda queda pendiente de aceptación visual. Las prioridades son una propuesta de orden de trabajo, todavía no acordada.

### Primera ronda: implementación disponible

Implementar los acuerdos de Hoy y del panel «Más», estableciendo estilos y estructura compartidos para las tarjetas que puedan reutilizarse en las siguientes pantallas. La revisión de Agenda, Pacientes y los demás recorridos continúa después de evaluar esta ronda.

Al implementar, resolver estados sin visitas, sin consultas por atender, nombres largos y múltiples seguimientos; verificar lectura, foco, desplazamiento y acciones en computadora y tamaños móviles. No atribuir validación física al Moto G15 hasta probarlo en ese dispositivo.

### Consultas en Hoy: criterio acordado

El usuario señala que la cantidad de consultas abiertas proviene de pruebas, pero que el bloque sigue siendo poco comprensible incluso con menos elementos. El problema requiere definir su propósito, además de compactar su presentación.

Actualmente el bloque enumera consultas activas con nombre, estado y seguimientos pendientes o vencidos; permite abrir el detalle. Una consulta activa no implica por sí sola una tarea para hoy.

Objetivo acordado: que ninguna consulta se quede sin un próximo paso.

- Título: **Consultas por atender**.
- Grupo **Seguimientos**: contactos previstos para hoy o atrasados, indicando la fecha.
- Grupo **Sin próximo paso**: consultas activas sin seguimiento pendiente ni evaluación agendada. La antigüedad o novedad de una consulta por sí sola no determina que requiera atención.
- Mostrar hasta tres consultas en total inicialmente, con el nombre y el motivo por el que requieren atención, una acción **Revisar consulta** y acceso **Ver todas** al conjunto de consultas.
- Ubicar el bloque después de las visitas de hoy y antes del bloque plegable de visitas pendientes de días anteriores.
- Las consultas que tienen una próxima acción programada a futuro no aparecen en el bloque hasta que corresponde atenderlas.
- No deducir una tarea específica (por ejemplo, llamar o reenviar un presupuesto) si no está registrada.

Detalles pendientes de resolución durante la implementación: orden dentro de cada grupo, tratamiento de múltiples seguimientos sin duplicar consultas y presentación cuando no hay consultas por atender. El acceso al conjunto de consultas debe seguir disponible aunque el bloque no tenga tareas.

### Implementación y validación

Comportamiento implementado para HOY-08, planteado por el usuario: cerrar el menú de opciones al activar el fondo exterior, sin ejecutar acciones de la pantalla subyacente. Los clics dentro del panel y los gestos de desplazamiento no deben cerrarlo. Al cerrar, devolver el foco al control que lo abrió. Evaluar como regla compartida para paneles de opciones; en formularios con cambios sin guardar, evitar descartar datos accidentalmente y definir su protección por separado.

Primera ronda implementada en `codex/ux-hoy-ronda-1`, desde `main` publicado en `7509b67`. La comparación con la copia anterior a consolidar Git confirmó que los 46 archivos de aplicación preservados no cambiaron durante la consolidación y que el CSS no se modificó. Se guardaron referencias visuales ficticias antes y después en `.local/ux-review/`, ignoradas por Git. Los fixtures de las pruebas pueden cambiar las cantidades visibles; la comparación acredita la estructura previa, no identidad de los datos entre corridas.

Se implementaron tarjetas compartidas para visitas y consultas, pendientes anteriores plegados, precauciones visibles junto al nombre, consultas por atender y su listado completo en `/consultas`, y reordenamiento/cierre exterior de paneles de opciones. El clic exterior no descarta los formularios. Se conserva el enlace profundo a una visita pendiente: abre el bloque y devuelve el foco al registro al cerrar el panel.

Como apoyo al plegado, cada pendiente muestra su fecha original (HOY-03); la legibilidad y separación de grupos (HOY-07) forman parte de la composición compartida. Ambas propuestas quedan incluidas en el resultado para aceptación visual. El contador de Hoy y la tira de fechas excluyen pendientes de días anteriores; el bloque plegable tiene su propia cantidad. El avance de tratamiento muestra sesiones realizadas, evitando anticipar una sesión por encima del cupo.

Las consultas se presentan una sola vez, con el contacto pendiente más antiguo primero y después las que no tienen seguimiento pendiente ni evaluación abierta. Un contacto de cualquier hora de hoy se incluye según la fecha de Buenos Aires. Las evaluaciones propuestas o confirmadas evitan clasificar una consulta como «sin próximo paso». Este bloque no incorpora las evaluaciones a la agenda principal ni resuelve ese pendiente funcional previo.

Validación automática final del 23/10/2026: lint y build aprobados, 152 pruebas unitarias, 25 de integración FHIR y 40 E2E aprobadas (24 en escritorio y 16 en emulación móvil). Se comprobaron tamaños de 320, 356, 390 y 1280 px, orientación horizontal, foco/teclado y texto al 200% con nombre ficticio largo. Se revisaron visualmente las capturas de Hoy y «Más». Se retiraron de `tsconfig.json` las inclusiones temporales de `.next-ux` generadas para compilar. Los fixtures visuales tienen identificadores propios y se limpian en 8081; las capturas no se versionan. Pendientes: aceptación conjunta del resultado en computadora y comprobación física en Moto G15. **Implementado no significa aceptado visualmente.**

## Recorrido pendiente

- Agenda y acciones de visita.
- Pacientes y alta de paciente.
- Ficha, tratamiento y períodos.
- Registro y consulta de visitas, incluidas edición, corrección y anulación.
- Informes y PDF.
- Consultas y presupuestos.
- Ingreso y recuperación de acceso.
- Dispositivos y configuración.

## Referencia de validación

La [lista técnica de UX de la superficie privada](ux-private-checklist.md) conserva comprobaciones anteriores y regresiones pendientes. Este seguimiento registra los acuerdos de la revisión actual; no convierte las comprobaciones previas en aceptación de los nuevos cambios.

## Reglas visuales compartidas de la primera ronda

- Componente `ClinicalCard`: identidad, estado, contexto y acciones en ese orden; variantes de visita y consulta sin mezclar sus conceptos.
- Tokens en `globals.css`: radio de tarjeta de 1 rem, separación de 0,75 rem y padding de 1,1 rem (1 rem en móvil). Fondo blanco sobre la superficie clara existente, borde suave y sombra discreta.
- Nombre: 1,2 rem en escritorio y 1,15 rem en móvil, con salto de línea y sin truncamiento. Horario: 1,25 rem. Progreso y contexto en un nivel secundario.
- Verde reservado a navegación/acciones y visita en curso; estados expresados también con texto. Las acciones de tarjetas ordinarias tienen fondo suave; la visita en curso mantiene énfasis sólido.
- Controles con altura mínima de 44 px a tamaño de texto normal, foco visible y semántica nativa para paneles y desplegables.
- Se conserva la fuente del sistema, sin incorporar fuentes o bibliotecas visuales externas.
- La adopción del componente en las tarjetas de Agenda y Pacientes se revisará en sus respectivas rondas; no se presenta como terminada.

Ajuste de revisión del 24/10/2026: el usuario considera que el resto de la primera ronda está bien. Las precauciones de las tarjetas de visita se muestran completas, sin interacción, porque suelen ser frases cortas y conviene leerlas antes de actuar. Se conserva una jerarquía secundaria con una marca ámbar y ajuste de línea, sin truncar el contenido. La revisión física en Moto G15 sigue pendiente.

## Recorrido de hoy y contacto rápido — 24/10/2026

Plan autorizado para implementar en la misma rama de UX. La hora acordada es una referencia y el recorrido representa el orden operativo del día; mover una tarjeta nunca reprograma la cita.

| ID | Acuerdo | Estado |
| --- | --- | --- |
| HOY-10 | Una lista de pendientes de hoy, con y sin horario, ordenable por arrastre desde un control específico y por teclado. | Implementado; pruebas automáticas aprobadas |
| HOY-11 | Una sola tarjeta «Próxima»: la primera del recorrido. Visita en curso aparte, sin arrastre. «Marcar como próxima» en Más lleva una visita al principio. | Implementado; pruebas automáticas aprobadas |
| HOY-12 | «Avisar por WhatsApp» visible cuando hay teléfono; abre el chat sin texto y no acredita envío. Llamada y mapa siguen en Más. | Implementado; pruebas automáticas aprobadas |
| HOY-13 | Conservar el orden entre recargas y dispositivos, detectar conflictos y permitir restablecer por horario. | Implementado; pruebas automáticas aprobadas |
| HOY-14 | Permitir comenzar visitas de hoy aunque su hora haya pasado; registrar una visita ya realizada es otra acción, dentro de Más. | Implementado; pruebas automáticas aprobadas |

Se usa dnd-kit (`@dnd-kit/react`, integración actual para listas ordenables), con control de arrastre separado de los enlaces y botones. El resto de la tarjeta conserva el desplazamiento normal. La interacción por teclado y los anuncios usan español. Se aplican las skills existentes de UX, accesibilidad, React y Playwright, sin incorporar otras skills.

Contrato de guardado: puerto de aplicación de recorrido diario, con fecha de Buenos Aires, identificadores de citas y versión; infraestructura persiste un `List` FHIR de trabajo por día (`daily-route-AAAA-MM-DD`). El recurso referencia citas y nunca reemplaza sus horarios. La escritura reutiliza el coordinador versionado de agenda existente y una transacción condicionada para evitar pérdidas incluso al crear el primer recorrido. El contenido FHIR no llega al navegador.

Sin orden guardado, se ordena por hora, luego sin horario por nombre, con identificador como desempate. Con orden guardado, se conservan las posiciones relativas, se excluyen visitas que ya no están pendientes ese día y se agregan las nuevas al final. Las visitas en curso, finalizadas, anuladas/reprogramadas y los registros por completar no se arrastran. Los pendientes anteriores y otros días mantienen sus bloques.

Al soltar o marcar como próxima se guarda el orden. Ante fallo se recupera el confirmado; ante conflicto se lee el vigente y se informa. Si no se puede verificar el recorrido, se impide reordenar hasta actualizarlo; las acciones clínicas siguen disponibles. Al volver a enfocar la pantalla se actualizan recorrido y datos, sin refrescar durante arrastre o guardado. No hay optimización de rutas, lectura del envío de mensajes ni modo sin conexión.

El 24/10/2026 el usuario confirmó acceso HTTPS en Moto G15 y funcionamiento correcto de la prueba guiada del recorrido (arrastre, desplazamiento sobre el contenido y «Marcar como próxima»). Las pruebas automatizadas y esta aceptación usan el entorno ficticio 8081; no acreditan uso con datos reales ni habilitan el piloto.

### Evidencia automática de esta ampliación

Verificación del 24/10/2026, con datos ficticios en 8081:

| Comprobación | Resultado |
| --- | --- |
| Lint | Aprobado |
| Pruebas unitarias | 161 aprobadas; 26 de integración omitidas por diseño |
| Integración FHIR | 26/26 aprobadas, incluida creación concurrente y rechazo de versiones anteriores del recorrido; las citas conservan su contenido y versión |
| Compilación de producción y TypeScript | Aprobados, salida aislada en `.next-ux` |
| Regresión completa de interfaz, última corrida | 46/46 aprobadas: 30 de escritorio y 16 de emulación móvil |

Los seis escenarios nuevos de interfaz verifican orden compartido entre contextos de escritorio y teléfono, recarga/retorno de foco, próxima única, teclado y Escape, mouse, gestos táctiles de Chromium, desplazamiento sobre el contenido sin reordenar, restablecimiento por hora, WhatsApp sin texto, horarios vencidos, error de transporte, conflicto de versión y salida del recorrido al comenzar/finalizar. La comprobación adaptable cubre 320, 356, 390 y 1280 px, nombres largos, ausencia de teléfono y precauciones, y texto ampliado al 200%. Referencias visuales ficticias en `.local/ux-review/after-mobile.png`, `after-desktop.png` y `route-mobile.png`, fuera de Git.

Incidencia conservada: la primera regresión general tuvo 44 aprobadas, una fallida y una no ejecutada por dependencia de la anterior. Tras anular una visita, la ficha mostró una versión previa y no incluyó todavía su enlace en el historial de anuladas. La lectura directa del recurso ficticio y una búsqueda posterior confirmaron el estado anulado. La repetición focal pasó 2/2 y la siguiente corrida general pasó 46/46 sin cambiar el código clínico ni debilitar la prueba. No se acreditó la causa ni se considera resuelta esta incidencia intermitente por el rediseño.

Las pruebas de arrastre esperan la finalización del movimiento y la versión confirmada por el servidor, distinguiendo la tarjeta de su placeholder decorativo. Se bloquea el control mientras termina de soltarse, para evitar perder un segundo movimiento inmediatamente después del primero.

Aceptación humana del 24/10/2026: el usuario confirmó que probó el recorrido en el Moto G15 y funciona bien; autorizó integrar todos los cambios de esta ronda en main local y remoto. La conformidad con el resto de la primera ronda y las precauciones visibles ya se había registrado. Esta confirmación no acredita las pruebas físicas de informes, recuperación de acceso, mensajería ni otros recorridos que no se probaron explícitamente; sus pendientes se conservan. Ninguna de estas comprobaciones habilita el piloto ni acredita datos reales.
