# Revisión UX/UI de la superficie privada

Esta lista acompaña el hito de gestión clínica y se aplica sólo a datos ficticios en HAPI `8081`.

## Criterios usados

- `ui-ux-pro-max`: jerarquía, densidad, responsive, formularios, feedback y navegación.
- `frontend-accessibility-best-practices`: HTML semántico, foco, teclado, anuncios y targets táctiles.
- `web-design-guidelines`: revisión final de formularios, estados, navegación y responsive.
- `playwright-skill`: flujos aislados en escritorio y viewport móvil.

## Resultado de la revisión

- [x] Inicio separa Hoy, Agenda y Pacientes y conserva enlaces profundos.
- [x] Los nombres de pacientes enlazan con la ficha.
- [x] Las acciones secundarias se agrupan bajo “Más” y los diálogos devuelven el foco.
- [x] Los diálogos se centran en escritorio y funcionan como hoja inferior en móvil.
- [x] Los campos privados tienen etiqueta visible, borde, fondo, foco y feedback de guardado.
- [x] Alta y edición de paciente usan tipos de input y autocompletado apropiados.
- [x] Diagnósticos se agregan de a una fila y pueden quitarse individualmente.
- [x] El registro confirmado mantiene una narrativa continua y deja evaluaciones plegadas al final.
- [x] Evaluaciones y procedimientos conservan acciones de editar/quitar y enlaces longitudinales.
- [x] Los errores se anuncian con `role="alert"` y no dependen sólo del color.
- [x] La navegación móvil evita scroll horizontal y mantiene acciones principales accesibles.
- [x] Pacientes usa precauciones compactas, desplegables y cerradas inicialmente.
- [x] Hoy mantiene el aviso compacto y el detalle completo de precauciones dentro de “Más”.
- [x] “Más” conserva acciones de visita; Pacientes conserva acciones de paciente y tratamiento.
- [x] Sesión, frecuencia y próxima visita mantienen una composición responsive estable en 320, 352, 356, 390 px y desktop.
- [x] Los teléfonos faltantes muestran placeholder y ocultan acciones; Maps conserva `noopener noreferrer` y aviso accesible de nueva pestaña.
- [ ] Completar revisión visual manual de ingreso, recuperación y configuración de dispositivos en Chrome de escritorio y Android.

## Regresión acumulada de Hoy, Agenda y Pacientes

- [ ] Filtros de Pacientes en una sola fila desplazable y estados vacíos.
- [ ] Nombre enlazado a la ficha, formato telefónico, llamada, WhatsApp y dirección.
- [ ] Maps abre una pestaña nueva de forma segura y accesible.
- [ ] Próxima visita con horario, sin horario y sin próxima visita.
- [ ] Nombres largos sin truncamiento, solapamiento ni scroll horizontal.
- [ ] Precauciones compactas en Hoy, desplegables en Pacientes y detalle completo en “Más”.
- [ ] “Más” ofrece las acciones correspondientes a la visita y devuelve el foco al cerrar.
- [ ] Agenda semanal en mobile, mensual en desktop, navegación de fecha y back/forward.
- [ ] Registro, reprogramación, cancelación, ausencia y resolución de visitas pendientes.
- [ ] Touch targets, foco visible, teclado, Escape y estados de carga/error.

## Revisión visual del hito actual

- [ ] Revisar capturas de Pacientes en 320, 352, 356 y 390 px.
- [ ] Revisar Pacientes en desktop y comparar con Hoy.
- [ ] Confirmar que la tarjeta permite encontrar rápidamente paciente, próxima visita, precauciones y acción.
- [ ] Resolver hallazgos visuales de impacto alto o medio antes de cerrar el hito.

## Pendientes no bloqueantes

- Revisar tipografía y espaciado fino después de validar los flujos clínicos completos.
- Añadir una comprobación automatizada de targets táctiles y contraste cuando la suite visual quede estable.
