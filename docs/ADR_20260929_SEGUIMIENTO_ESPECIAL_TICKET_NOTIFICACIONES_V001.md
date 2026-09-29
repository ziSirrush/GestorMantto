# ADR 2026-09-29 — Seguimiento Especial general · Ticket · Notificaciones V001

## Estado

Implementado para Fase 2/4 de programación.

## Base

- Repositorio fuente: `ziSirrush/GestorMantto`.
- Rama: `main`.
- Commit base verificado: `f69aa5d40796c5976cf8d59eb6f6f99dbd930299` (`Version 092826.3`).
- Dependencia funcional: Fase 1 `FASE_1_SEGUIMIENTO_ESPECIAL_TICKET_BACKEND_V001` aplicada.
- Base de datos: se asume creada la tabla general `seguimiento_especial`; esta fase no entrega SQL.

## Contexto

Seguimiento Especial ya resolvia followers de Proyecto/Equipo mediante `portafolio_interes` y el motor central ya sabia:

- fusionar follower + destinatario nativo;
- deduplicar por usuario;
- conservar la metadata semantica `SEGUIMIENTO_ESPECIAL`;
- respetar exclusiones nativas, incluida la del actor;
- entregar al follower autorizado sin volver a exigir rol nativo.

Fase 1 agrego la persistencia/API para una suscripcion puntual de entidad `TICKET` en la tabla general `seguimiento_especial`.

Faltaba que el resolver de Notificaciones leyera esa suscripcion y la incorporara al mismo motor existente.

## Decisión

1. No se crea un motor paralelo de notificaciones.
2. `portafolio_interes` permanece intacta y conserva Proyecto/Equipo, herencia y overrides actuales.
3. Para un contexto `UNITED + TICKET`, el resolver consulta adicionalmente `seguimiento_especial` por:
   - `origen = 'UNITED'`;
   - `entidad_tipo = 'TICKET'`;
   - `entidad_id = tickets.id`;
   - `activo = 1`.
4. La suscripcion de Ticket es puntual. No sigue automaticamente su Proyecto, Equipo ni otros Tickets del mismo Proyecto/Equipo.
5. El seguidor directo de Ticket se fusiona con los seguidores de Proyecto/Equipo que ya correspondan al mismo evento.
6. Si el mismo usuario llega por varias rutas, recibe una sola entrega. El origen `TICKET` tiene prioridad semantica sobre `EQUIPO`, `PROYECTO` y `PROYECTO_HEREDADO`.
7. Un `followers_snapshot` previo no reemplaza ni suprime la suscripcion directa del Ticket; ambas fuentes se combinan y deduplican.
8. Antes de autorizar la entrega se mantiene:
   - usuario activo;
   - permiso efectivo vigente de Seguimiento Especial;
   - alcance UNITED/ZOP vigente.
9. La revocacion del permiso o del alcance impide futuras entregas aunque la fila de seguimiento permanezca activa.
10. No se modifica la exclusion nativa del actor.
11. No se crean eventos nuevos de Seguimiento Especial. El evento nativo sigue siendo la verdad del negocio.

## Cobertura de Ticket existente

La nueva suscripcion directa participa en cualquier evento que ya entregue `contextoSeguimiento` con identidad `TICKET`. En el baseline actual esto incluye, entre otros:

- `TICKET_CREADO`;
- `TICKET_ESTATUS_CAMBIADO`;
- `TICKET_PRIORIDAD_CAMBIADA`;
- `TICKET_ASIGNACION_CAMBIADA`;
- `TICKET_RESPONSABILIDAD_CAMBIADA`;
- `tickets.comentario.creado`;
- `tickets.vobo.actualizado`;
- eventos criticos de Ticket que ya usan la misma capa transversal.

`TICKET_ESTATUS_CAMBIADO` ya observa `estado_ticket`, `estado`, `estatus_equipo_final` y `fecha_cierre`; por tanto, cierre y reapertura/cambio de estado no requieren un evento paralelo para el follower.

## Compatibilidad con Portafolio

La resolucion queda conceptualmente:

```text
Evento UNITED con contexto TICKET
        |
        +--> seguimiento_especial
        |      TICKET puntual
        |
        +--> portafolio_interes
               Equipo / Proyecto / herencia

        => fusion + deduplicacion
        => filtro permiso/alcance
        => motor central existente
```

No existe migracion de `portafolio_interes` a la tabla general.

## Limites de Fase 2

- No agrega frontend.
- No agrega el control estrella al Detalle Ticket.
- No agrega el listado Tickets al modulo Seguimiento Especial.
- No implementa otros `entidad_tipo` en la tabla general.
- No implementa `fl_interes`.
- No cambia el catalogo de permisos.
- No cambia tablas ni SQL.

## Consecuencia

Despues de Fase 1 + Fase 2, un usuario autorizado que siga directamente el Ticket `254013` puede recibir la actividad nativa de ese Ticket aunque no siga su Proyecto o Equipo. La suscripcion no se propaga a ningun otro registro.
