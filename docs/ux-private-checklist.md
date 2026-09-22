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
- [ ] Completar revisión visual manual de ingreso, recuperación y configuración de dispositivos en Chrome de escritorio y Android.

## Pendientes no bloqueantes

- Revisar tipografía y espaciado fino después de validar los flujos clínicos completos.
- Añadir una comprobación automatizada de targets táctiles y contraste cuando la suite visual quede estable.
