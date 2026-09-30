# Prueba física pendiente: períodos e informes

Usar Ubuntu/Chrome y Moto G15/Chrome conectados al entorno ficticio habitual. Estas pruebas del incremento nuevo todavía **no están confirmadas**; la validación física anterior de autenticación y visitas no las sustituye. No hace falta otro autenticador para este recorrido.

## Preparación

1. Abrí la aplicación local habitual en ambos dispositivos y entrá con la passkey ya registrada. Usá el acceso LAN configurado en `docs/dev-lan.md`; no cambies el destino a HAPI 8080.
2. En Ubuntu, **Pacientes → Crear → Nuevo paciente**, creá una ficha exclusivamente ficticia: nombre `Prueba`, apellido `Informes Ficticios`, teléfono `0000000101`, dirección `Domicilio ficticio para pruebas`. Si ya existe esa ficha, usá otra con apellido `Informes Ficticios 2`; no reutilices una persona real.
3. Desde su ficha, **Comenzar tratamiento**: inicio el día de la prueba, cupo `1`, frecuencia `1 visita por semana`. Dejá los diagnósticos vacíos y guardá.
4. En el Moto, buscá la misma ficha. Ambos deben mostrar `0 de 1` en el período inicial.

## A. Completar, revisar y guardar en Ubuntu

1. Comenzá una visita desde Pacientes. Estado y respuesta: `Estado ficticio de prueba; tolera la actividad registrada`. Intervención: `Ejercicio ficticio para comprobar el informe`. Próximo paso: `Revisar evolución en la visita siguiente`. Finalizala.
2. En la ficha, comprobá `1 de 1` y **Informe pendiente**. Abrí **Ver períodos e informes**. Intentar registrar otra visita debe llevar a revisar el período, sin crear otra.
3. En el borrador, modificá **Observaciones del profesional** a `Informe ficticio revisado en Ubuntu`. Profesional: `Profesional ficticio`; matrícula opcional `DEMO-001`.
4. Confirmá la casilla y **Guardar informe definitivo**. Abrí **Ver informe**: el texto debe conservarse y no deben aparecer campos de edición.
5. Descargá y abrí el PDF. Comprobá nombre ficticio, `1 de 1`, fecha local, tildes y observaciones. Recargá el informe: debe permanecer igual. Anotá cualquier problema de descarga o de visualización.

## B. Renovar desde el Moto

1. Abrí la ficha en el Moto y **Ver períodos e informes**. Debe mostrar el mismo informe guardado.
2. En **Renovar otro período**, elegí cupo `2`, frecuencia `2 visitas por semana` y **Renovar período**.
3. Debe abrir **Período 2 · 0 de 2 · Abierto**. Recargá la ficha en Ubuntu: debe mostrar el mismo contador. El informe anterior continúa en el historial del período 1.
4. En el Moto, registrá una visita del período 2 con estado `Evolución ficticia del segundo período`, intervención `Actividad ficticia de prueba` y finalizala. Comprobá `1 de 2` en ambos dispositivos al recargar.

## C. Corrección posterior al cierre y reemplazo voluntario

1. En Ubuntu, abrí la visita del período 1 desde el historial de visitas de la ficha. **Corregir visita**: cambiá su estado a `Estado ficticio corregido después de renovar`, motivo `Corrección ficticia posterior al cierre` y guardá.
2. En períodos, seleccioná **Período 1**. Debe permanecer **Cerrado**, señalar el cambio de fuentes y permitir **Emitir reemplazo**.
3. El período 2 debe continuar abierto con `1 de 2`; esta corrección del período anterior no debe bloquearlo.
4. Emití el reemplazo con motivo `Actualizar informe ficticio tras la corrección`. Revisá el texto, completá el profesional si falta, confirmá y guardá.
5. En el historial, comprobá dos informes del período 1: original **Reemplazado** y nuevo **Vigente**. Abrí ambos; el original debe conservar su texto anterior y el reemplazo su texto revisado.

## D. Cierre parcial desde el Moto

1. Seleccioná el período 2 (`1 de 2`) y abrí **Finalizar anticipadamente**. Motivo: `Cierre parcial ficticio para validar el dispositivo`.
2. **Preparar cierre parcial**: debe mostrar informe pendiente y ese motivo. **Cancelar cierre parcial** debe devolverlo a abierto con `1 de 2`.
3. Repetí el cierre parcial, guardá su informe con observaciones `Cierre parcial ficticio revisado en Moto G15`, profesional `Profesional ficticio` y confirmación.
4. No debe permitir renovar anticipadamente. Abrí **Finalizar tratamiento**, elegí el día de la prueba y confirmá. No generes citas adicionales durante este paso.
5. Recargá la ficha en Ubuntu: tratamiento **Finalizado**, período 2 cerrado e informes consultables. Comprobá el PDF parcial desde el Moto.

## E. Borrador ante cambios desde otro dispositivo

Usá otra ficha ficticia con cupo 1 y una visita finalizada; no reutilices el tratamiento ya finalizado.

1. En Ubuntu, abrí el informe pendiente. Escribí `Texto ficticio que quiero conservar` en Evolución y completá el nombre del profesional. Mantené abierto el borrador.
2. Desde el Moto, corregí el estado de esa visita con texto `Cambio ficticio desde el otro dispositivo` y motivo `Prueba ficticia de conflicto de informe`.
3. En Ubuntu, intentá guardar. Debe bloquearse, conservar tu texto y nombre y ofrecer **Ver registros clínicos actualizados**.
4. Revisá esa versión, pulsá **Actualizar datos estructurados y conservar mi texto**, verificá que el texto propio siga igual, volvé a confirmar la casilla y guardá.
5. Abrí el definitivo y comprobá el texto revisado. No cierres el borrador antes de guardar: no tiene respaldo persistente.

## Registro del resultado

Informar para cada bloque A–E: `Ubuntu: aprobado/falló/no realizado`, `Moto: aprobado/falló/no realizado`, pantalla/paso y comportamiento observado si falló. No compartir PIN, códigos de recuperación ni datos reales. El cierre físico se registra únicamente después de esa confirmación.
