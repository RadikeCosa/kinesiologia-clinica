# Producto

## Usuario

Un profesional independiente que realiza kinesiología domiciliaria y administra personalmente pacientes, tratamientos, visitas y comunicaciones clínicas.

La V1 tiene una sola cuenta provisionada. No incluye registro público, equipos, organizaciones ni roles.

## Problema

El registro durante una atención suele quedar postergado o fragmentado entre memoria, mensajes y notas. Después hay que reconstruir la evolución para informar a familiares o preparar documentación profesional.

Las prioridades son:

1. registrar visitas desde el teléfono sin interrumpir la atención;
2. reconstruir la evolución sin volver a redactar lo ya registrado;
3. organizar pacientes activos y acciones pendientes.

La pantalla de acceso presenta la aplicación como una herramienta de kinesiología domiciliaria. El ingreso es la acción principal; la recuperación y las herramientas de desarrollo quedan separadas del recorrido clínico.

## Promesa

> Registrar una vez. Comunicar y reportar sin volver a escribir.

## Núcleo de V1

- acceso persistente y de baja fricción para una cuenta provisionada;
- pacientes y tratamientos activos;
- pantalla inicial con Hoy, Agenda y Pacientes;
- citas con horario o día sin hora, duración, reprogramación, cancelación y ausencia;
- visita iniciada en vivo o mediante carga diferida de una atención ya realizada;
- hora de entrada y salida;
- registro breve con estado y respuesta, intervención y próximo paso opcional;
- evaluaciones longitudinales y familias de procedimientos ampliables;
- combinación deliberada de datos estructurados y narrativa;
- PWA con contexto activo, borradores y sincronización confiable;
- resumen de visita editable para compartir como texto;
- informe de evolución o cierre en PDF versionado.

`Visita` es el término principal de la interfaz. `Sesión` es un sinónimo natural en comunicaciones e informes. Una `intervención` es el trabajo realizado dentro de la visita.

## Flujo online implementado

`/inicio` es la entrada posterior al ingreso. `+ Crear` permite iniciar una ficha de paciente o agendar una visita. `Hoy` separa la visita en curso, visitas pendientes de días anteriores, horarios del día, visitas sin hora, realizadas y cambios registrados hoy. Las visitas anteriores conservan su fecha original y se resuelven con **Registrar visita**, incluso cuando no tenían horario y requieren cargar la hora efectiva. `Agenda` permite recorrer meses, abrir el detalle de cada fecha y resolver desde una sección explícita las visitas pendientes de días anteriores. `Pacientes` permite buscar y filtrar por estado, incluido **Sin iniciar**, abrir teléfono, WhatsApp o mapa por acción explícita y acceder a la ficha. La ficha muestra cada visita anterior aún pendiente con un enlace que abre directamente su registro en `Hoy`.

Una ficha nueva requiere nombre, apellido, teléfono y dirección; las indicaciones para llegar son opcionales. La aplicación advierte una coincidencia exacta de teléfono y permite revisar la ficha previa o crear igualmente. La ficha permite editar esos mismos datos con control de versión. El tratamiento se inicia desde la ficha, sin requerir una solicitud previa: fecha de inicio, sesiones previstas y frecuencia son obligatorias; contexto, precauciones y diagnósticos son opcionales. El contexto y los diagnósticos también pueden editarse con control de versión. Un tratamiento puede pausarse, reanudarse o finalizarse, pero no mientras mantenga citas abiertas. Los cambios y sus notas opcionales permanecen en el historial del tratamiento.

La cita representa lo acordado. Puede crearse, reprogramarse conservando la anterior, cancelarse o quedar como no realizada. Entre los motivos figura la ausencia del paciente en el domicilio, con nota opcional. Un cruce horario advierte y exige confirmación. La atención crea un único `Encounter` en curso, enlazado a la cita cuando existe; puede continuarse, anularse si fue un inicio accidental y finalizarse con evolución y métricas opcionales.

La interfaz muestra puntualidad de inicio y demora de documentación a partir de los horarios crudos. Las tendencias y resúmenes agregados pertenecen a los informes posteriores.

Una visita prevista sin horario puede comenzar en el momento si corresponde al día actual, definirse antes de la fecha acordada o registrarse como ya realizada si quedó pendiente. Conserva su día acordado sin inventar una hora prevista, por lo que no genera indicador de puntualidad. Los estados de Hoy se calculan al cargar con la hora de referencia del servidor y la zona `America/Argentina/Buenos_Aires`; la pantalla no cambia de estado automáticamente mientras permanece abierta.

## Registro clínico breve

La visita habitual exige solo **Estado y respuesta** e **Intervención realizada**. **Próximo paso**, **Evaluaciones** y **Procedimientos** permanecen plegados mientras estén vacíos. El mismo editor se usa al finalizar una visita en vivo y al cargar una atención de forma diferida.

Las evaluaciones admiten medida numérica, categoría, sí/no, descripción o ausencia justificada. **Nueva evaluación** abre un registro vacío; cambiar de dominio dentro del editor también limpia el nombre, el resultado y el contexto anteriores para no arrastrar una evaluación distinta. Dolor NRS permite elegir un número entero de 0 a 10 con teclado o barra visual, sincronizados y sin valor inicial. Las tarjetas de la visita destacan el resultado, muestran el contexto principal y permiten desplegar el resto; el color refuerza visualmente la intensidad NRS sin asignar categorías clínicas automáticas. Una identidad de serie estable permite repetirlas y revisar sus resultados cronológicos desde la ficha del paciente. La aplicación muestra los datos registrados sin calcular progreso ni emitir interpretaciones clínicas. Los procedimientos identifican familias realizadas; el detalle clínico conjunto continúa en la narrativa de intervención.

El detalle confirmado prioriza horarios efectivos y puntualidad, cómo estaba y cómo respondió el paciente, evaluaciones, qué se hizo y próximo paso. La información operativa queda desplegable. Cada evaluación enlaza con su serie longitudinal. Una visita confirmada puede corregirse con motivo obligatorio o anularse si fue registrada por error; la anulación la retira de los conteos y del seguimiento vigente sin borrarla definitivamente.

## Fuera de V1

- portal de pacientes o familiares;
- SaaS multiusuario;
- historia clínica integral;
- recomendaciones clínicas automáticas;
- réplica offline de toda la historia;
- acceso directo del navegador a HAPI FHIR.
