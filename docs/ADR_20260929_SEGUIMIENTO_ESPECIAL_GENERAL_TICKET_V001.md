# ADR 2026-09-29 - Seguimiento Especial general · TICKET V001

## Estado

Aprobado para Fase 1 de 4 de programacion.

## Base

- Repositorio fuente: `ziSirrush/GestorMantto`.
- Rama: `main`.
- Commit base verificado: `f69aa5d40796c5976cf8d59eb6f6f99dbd930299` (`Version 092826.3`).

## Contexto

El Seguimiento Especial actual de Portafolio persiste Proyecto/Equipo en `portafolio_interes` y contiene reglas propias de herencia y excepcion. Esa tabla no puede identificar de forma inequivoca un Ticket individual: su identidad persistida es usuario + `id_portafolio`.

Se aprobo mantener tres familias separadas por naturaleza de negocio:

- UNITED / Portafolio: `portafolio_interes` para Proyecto/Equipo.
- CORELLIAN / FL: futura `fl_interes` para Proyecto/Equipo.
- General: `seguimiento_especial` para entidades puntuales que requieran seguimiento personal.

La tabla general se deja preparada para futuros tipos, pero esta fase implementa exclusivamente `TICKET`.

## Decision

1. `portafolio_interes` permanece sin cambios.
2. `seguimiento_especial` es la persistencia general para entidades puntuales.
3. El primer contrato implementado es:
   - `origen = 'UNITED'`;
   - `entidad_tipo = 'TICKET'`;
   - `entidad_id = tickets.id`;
   - `entidad_clave = tickets.ticket`.
4. El backend no acepta `origen` ni `entidad_tipo` arbitrarios desde el cliente. Ambos valores son constantes del caso TICKET.
5. La relacion es directa al Ticket. No activa seguimiento del Proyecto, Equipo ni otros Tickets relacionados.
6. Cerrar un Ticket no desactiva la suscripcion. La baja solo ocurre cuando el usuario la desmarca.
7. La tabla general no duplica estado, proyecto, equipo, prioridad ni otros atributos del Ticket. Esos datos siempre se leen desde `tickets`.
8. La entidad general no tiene FK hacia `tickets.id`, porque la misma columna `entidad_id` debe poder identificar otras tablas en futuros tipos. La existencia y alcance del Ticket se validan en backend antes de leer o escribir la suscripcion.
9. Se conserva el permiso tecnico vigente de Seguimiento Especial. Esta fase no crea ni renombra permisos.
10. La Fase 1 no integra destinatarios de notificaciones. Esa conexion corresponde a Fase 2.

## Contrato de tabla asumido

Esta entrega asume que `seguimiento_especial` ya existe en Aiven con, como minimo:

- `id_seguimiento`;
- `id_usuario`;
- `origen`;
- `entidad_tipo`;
- `entidad_id`;
- `entidad_clave`;
- `activo`;
- `created_at`;
- `updated_at`;
- unicidad efectiva para `id_usuario + origen + entidad_tipo + entidad_id`.

No se incluye SQL en esta fase por instruccion expresa: la tabla se considera prerrequisito ya aplicado.

## API Fase 1

- `GET /api/seguimiento-especial/tickets`
- `GET /api/tickets/:ticket/seguimiento-especial`
- `PUT /api/tickets/:ticket/seguimiento-especial`

La referencia `:ticket` puede resolverse por los mismos identificadores humanos usados actualmente en Tickets: `tickets.ticket`, `tickets.id`, `folio` o `id_interno`. La fila persistida siempre queda canonizada con `tickets.id` y `tickets.ticket`.

## Alcance y seguridad

- La API exige el permiso vigente de Seguimiento Especial.
- Se conserva el alcance territorial UNITED resuelto por el Guard General.
- La consulta del Ticket vuelve a aplicar `buildTicketScopeSql_gnral`; no se confia en una referencia enviada por frontend.
- Seguimiento Especial sigue siendo personal y falla cerrado en modo Visor de otro usuario.

## Consecuencias

La base queda preparada para incorporar otros tipos de entidad sin ampliar todavia su comportamiento. Agregar un tipo futuro requerira codigo explicito para validar su tabla fuente, permisos y alcance; no bastara con enviar un nuevo `entidad_tipo` desde frontend.
