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
| HOY-01 | Mostrar primero las visitas de hoy y agrupar las pendientes de días anteriores en un bloque plegable con su cantidad. | Acordado | Alta |
| HOY-02 | Destacar nombre y horario; dejar el avance del tratamiento en un nivel secundario. | Acordado | Alta |
| HOY-03 | Mostrar la fecha original en cada visita pendiente para distinguir días diferentes. | Propuesto | Alta |
| HOY-04 | Reducir el peso visual de los botones repetidos, conservando una acción principal reconocible. | Acordado | Media |
| HOY-05 | Integrar un aviso compacto de precauciones junto al nombre, visible cuando existan, con detalle accesible al activarlo; quitar la franja inferior. | Acordado | Media |
| HOY-06 | Reemplazar el listado de consultas abiertas por «Consultas por atender», con seguimientos de hoy o atrasados y consultas sin próximo paso, según el criterio detallado abajo. | Acordado | Alta |
| HOY-07 | Mejorar separación de grupos de información y contraste de los textos secundarios. | Propuesto | Media |
| HOY-08 | Permitir cerrar el panel «Más» al hacer clic o tocar el fondo oscurecido, conservando la X y Escape. | Acordado | Media |
| HOY-09 | En «Más», mostrar primero identidad y precauciones, luego acciones de visita y después contacto y ubicación. | Acordado | Alta |

HOY-01, HOY-02, HOY-04, HOY-05, HOY-06, HOY-08 y HOY-09 fueron acordados durante la revisión. La composición concreta de las tarjetas y la presentación de las opciones secundarias se resolverán durante la implementación y se revisarán con el usuario sobre el resultado. Las demás propuestas requieren acuerdo antes de implementarlas. Las prioridades son una propuesta de orden de trabajo, todavía no acordada.

### Primera ronda: alcance preparado

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

Propuesta de interacción para HOY-08, planteada por el usuario: cerrar el menú de opciones al activar el fondo exterior, sin ejecutar acciones de la pantalla subyacente. Los clics dentro del panel y los gestos de desplazamiento no deben cerrarlo. Al cerrar, devolver el foco al control que lo abrió. Evaluar como regla compartida para paneles de opciones; en formularios con cambios sin guardar, evitar descartar datos accidentalmente y definir su protección por separado.

Todavía no se implementaron cambios como parte de esta revisión. Pendientes: revisión conjunta del resultado en computadora, comprobación responsive y comprobación física en Moto G15.

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
