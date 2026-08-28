# FASE 2 - NORMALIZACION DE EMISORES DE NOTIFICACIONES

Fecha: 25/08/2026  
Repositorio base: `ziSirrush/GestorMantto`  
Branch base: `main`  
Commit base verificado: `0dbbdf425bd17b5f3e6ad9a018d4ec1bc51eaaee`

## Objetivo

Conectar Tareas, Tickets y Soporte al motor central de Notificaciones de Fase 1, usando exclusivamente los codigos de evento ya existentes en el catalogo y evitando que un fallo de Notificaciones revierta una accion de negocio ya valida.

Esta fase NO crea tablas, NO agrega eventos nuevos y NO modifica Ventas ni los eventos criticos.

## Prerrequisito obligatorio

Aplicar primero **Fase 1 - Motor Central**. Fase 2 depende de:

- matriz Evento-Rol activa;
- evaluacion multirrol;
- alcance UNITED y `DOMINIO_COMPLETO`;
- exclusion del actor;
- `clave_deduplicacion`;
- `trace_id`;
- deduplicacion unica de `sup_notificaciones`.

## Eventos normalizados en esta fase

| Modulo | Evento oficial |
| --- | --- |
| Tareas | `tareas.asignada` |
| Tareas | `tareas.comentario.creado` |
| Tickets | `tickets.comentario.creado` |
| Tickets | `tickets.vobo.actualizado` |
| Soporte | `soporte.solicitud.actualizada` |

El catalogo actual solo contiene un evento especifico de Soporte (`soporte.solicitud.actualizada`). Por eso los cambios, comentarios, archivos y alta de solicitud de Soporte se enrutan a ese codigo en esta fase, en lugar de inventar nuevos codigos `SOPORTE_*` fuera del Panel.

## Cambios realizados

### 1. Emisor seguro posterior al negocio

Nuevo archivo:

`backend/src/services/notifications/notification-business-emitter.service.js`

Reglas:

- exige `codigoEvento` oficial;
- exige identidad persistente de la accion (`eventInstanceKey`);
- genera/conserva `trace_id`;
- llama al motor central de Fase 1;
- captura errores de Notificaciones y devuelve diagnostico sin propagar el error al negocio.

### 2. Tareas

Archivo modificado:

`backend/src/modules/pendientes/pendientes.service.js`

Cambios:

- elimina emisiones `TAREA_ASIGNADA`, `TAREA_COMENTARIO` y `COMENTARIO` generico;
- asignacion usa `tareas.asignada`;
- comentario o archivo en una interaccion usa `tareas.comentario.creado`;
- la notificacion se emite despues de `COMMIT`;
- solo una asignacion realmente nueva genera el evento;
- deduplicacion de asignacion: `id_pendiente + id_pendiente_usuario`;
- deduplicacion de comentario: `id_comentario`;
- conserva creador/relacionados como candidatos y el motor aplica rol, preferencias, actor y alcance.

### 3. Tickets

Nuevo archivo:

`backend/src/modules/tickets/tickets-notification-writes.service.js`

Archivo modificado:

`backend/src/modules/tickets/tickets.repository.js`

Cambios:

- comentario y Vo.Bo. salen del handler monolitico legacy sin modificar el resto del controlador;
- conserva las reglas actuales de validacion: Supervisor/Superintendente responsable, Director General y Programador; reversa solo Programador;
- `tickets.comentario.creado` usa `id_comentario` como identidad real;
- `tickets.vobo.actualizado` usa `id_validacion` como identidad real;
- ambas notificaciones se emiten solo despues del `COMMIT`;
- el alcance de Ticket se resuelve con `portafolio.zona_id` siguiendo la precedencia UNITED: equipo primero; proyecto/proyecto_padre solo cuando no existe codigo de equipo;
- `tickets.zona` no concede alcance;
- el motor central decide destinatarios por matriz activa, roles, alcance y preferencias.

### 4. Soporte

Archivo modificado:

`backend/src/services/support-solicitudes.service.js`

Cambios:

- elimina escrituras directas a `sup_notificaciones`;
- elimina `SOPORTE_ARCHIVO`, `SOPORTE_ESTADO`, `SOPORTE_PRIORIDAD`, `SOPORTE_ASIGNACION`, `SOPORTE_REASIGNACION`, `SOPORTE_SOLICITUD_ACTUALIZADA`, `SOLICITUD_SOPORTE` y `COMENTARIO` generico como codigos emitidos;
- conserva la relacion actual de candidatos: solicitante, soporte asignado y rol Soporte segun la accion;
- usa `soporte.solicitud.actualizada` como evento canonico disponible;
- cambios simultaneos de estado/prioridad/asignacion se consolidan en una sola notificacion logica por destinatario;
- usa historial persistido de `sup_tickets` para identidad de cambios/comentarios/archivos;
- la creacion usa `ticketId` como identidad estable.

## SQL incluido

`backend/sql/20260825_VERIFICAR_NOTIFICACIONES_FASE_2_EMISORES.sql`

Es **solo lectura**. Verifica:

- existencia y activacion de los 5 eventos;
- al menos una relacion Evento-Rol activa por evento;
- relaciones hacia roles inactivos/inexistentes;
- prerrequisitos `clave_deduplicacion` y `trace_id` de Fase 1;
- indice unico de deduplicacion;
- asociaciones de usuario a roles invalidos;
- diagnostico de zonas UNITED.

## Validaciones realizadas

- `node --check`: 5/5 archivos JavaScript de Fase 2 OK.
- `node --test validation/notification-phase2.test.js`: 16/16 pruebas OK.
- regresion Fase 1: 9/9 pruebas OK.
- total de pruebas ejecutadas: 25/25 OK.
- escaneo de emisores modificados: 0 emisiones de codigos legacy objetivo.

## Orden de despliegue

1. Confirmar/aplicar Fase 1 completa.
2. Ejecutar el SQL de verificacion de Fase 2; revisar que los cinco eventos esten activos y con matriz activa.
3. Copiar los archivos de Fase 2 respetando las rutas del ZIP.
4. Reiniciar/redeploy del backend.
5. Repetir el SQL de verificacion.
6. Probar al menos una accion real por cada uno de los cinco eventos.

## Prueba funcional minima recomendada

1. Asignar una tarea colaborativa a un usuario permitido.
2. Crear un comentario y una interaccion con archivo en una tarea.
3. Comentar un Ticket.
4. Cambiar Vo.Bo. de un Ticket.
5. Actualizar una solicitud de Soporte y adjuntar un archivo.
6. En cada caso validar `sup_notificaciones.tipo_notificacion`, `clave_deduplicacion`, `trace_id`, actor excluido, destinatarios y ruta.
7. Repetir/reintentar la misma emision y confirmar que no aparezca una segunda notificacion logica.

## Fuera de Fase 2

Quedan expresamente para fases posteriores:

- `ventas.cotizacion.comentario`
- `ventas.cotizacion.estatus`
- `ventas.prospeccion.comentario`
- `ventas.prospeccion.estatus`
- `ventas.redes.comentario`
- `ventas.redes.estatus`
- `FALLA_EQUIPO_CRITICO`
- `NUEVO_EQUIPO_CRITICO`
- `PERSONA_ATRAPADA`

## Limite de verificacion

El codigo y las pruebas estaticas/locales quedan validados. **No puedo confirmar el comportamiento runtime en Aiven/Railway hasta desplegar esta fase y ejecutar las pruebas funcionales con la matriz y preferencias reales.**
