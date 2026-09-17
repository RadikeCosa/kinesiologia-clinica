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

`/inicio` es la entrada posterior al ingreso. `Hoy` separa pendientes anteriores, horarios, visitas sin hora y actualizaciones del día. `Agenda` permite recorrer meses y abrir el detalle de cada fecha, manteniendo los pendientes anteriores separados. `Pacientes` permite buscar y filtrar por estado, abrir teléfono, WhatsApp o mapa por acción explícita y acceder a la ficha.

La cita representa lo acordado. Puede crearse, reprogramarse conservando la anterior, cancelarse o quedar como no realizada. Un cruce horario advierte y exige confirmación. La atención crea un único `Encounter` en curso, enlazado a la cita cuando existe; puede continuarse, anularse si fue un inicio accidental y finalizarse con evolución y métricas opcionales.

La interfaz muestra puntualidad de inicio y demora de documentación a partir de los horarios crudos. Las tendencias y resúmenes agregados pertenecen a los informes posteriores.

Una visita prevista sin horario puede comenzar en el momento mediante una confirmación breve o cargarse como ya realizada. Conserva su día acordado sin inventar una hora prevista, por lo que no genera indicador de puntualidad. Hoy cuenta tanto las visitas de la fecha como los pendientes operativos arrastrados de días anteriores.

## Registro clínico breve

La visita habitual exige solo **Estado y respuesta** e **Intervención realizada**. **Próximo paso**, **Evaluaciones** y **Procedimientos** permanecen plegados mientras estén vacíos. El mismo editor se usa al finalizar una visita en vivo y al cargar una atención de forma diferida.

Las evaluaciones admiten cantidad, resultado categórico, sí/no, narrativa o ausencia justificada. Una identidad de serie estable permite repetirlas y revisar sus valores cronológicos desde la ficha del paciente. La aplicación muestra los datos registrados sin calcular progreso ni emitir interpretaciones clínicas. Los procedimientos identifican familias realizadas; el detalle clínico conjunto continúa en la narrativa de intervención.

El detalle confirmado sigue una narrativa estable: contexto temporal, estado y respuesta, evaluaciones, intervención y procedimientos, próximo paso e información operativa. Cada evaluación de una visita enlaza directamente con todos los registros de su misma serie en la ficha del paciente.

## Fuera de V1

- portal de pacientes o familiares;
- SaaS multiusuario;
- historia clínica integral;
- recomendaciones clínicas automáticas;
- réplica offline de toda la historia;
- acceso directo del navegador a HAPI FHIR.
