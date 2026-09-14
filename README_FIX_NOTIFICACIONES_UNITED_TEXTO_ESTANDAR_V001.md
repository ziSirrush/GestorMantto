# FIX NOTIFICACIONES UNITED - TEXTO ESTANDAR V001

Fecha: 2026-09-14
Proyecto: Gestor Mantto
Base revisada: ziSirrush/GestorMantto main @ 96dec3c260e72f07e790a5e78f59e742e7b37437

## Alcance

Normaliza exclusivamente la presentacion visible de las notificaciones UNITED actuales.
No modifica destinatarios, matrices Evento-Rol, Seguimiento Especial, alcance, deduplicacion, rutas ni sincronizacion de Tickets/Portafolio.

## Norma de presentacion

Primera linea / titulo Push:

    Emoji del Evento + Evento

Segunda linea / mensaje:

    Se genero + accion + Proyecto - Ref en sitio

Ejemplos:

    🚨 Ticket de Persona Atrapada ⭐
    Se generó ticket 253298 por persona atrapada · Almada - Equipo Único.

    🎫 Ticket generado ⭐
    Se generó ticket 254013 · Neuchatel 7 - Elevador 4 EE-04.

    ⛔ Equipo No en Servicio ⭐
    Se generó cambio de estatus de servicio de En Servicio a No en Servicio · Proyecto Norte - Lobby.

La estrella no se hardcodea como dato de negocio. Sigue resolviendose desde el catalogo `estados_visuales` mediante `SEGUIMIENTO_ESPECIAL`.

## Correcciones incluidas

- TICKET_CREADO, estatus, prioridad, asignacion y responsabilidad usan Emoji real y texto uniforme.
- Ticket Cerrado conserva Estatus Final del Equipo.
- Criticos y Persona Atrapada usan Evento + accion + Proyecto - Ref en sitio.
- Comentarios y Vo.Bo. usan el mismo patron.
- Portafolio ingreso/salida/cambios y En Servicio <-> No en Servicio usan el mismo patron.
- Push UNITED deja de imprimir clases CSS como `ti ti-ticket`.
- Para UNITED, Push deja de anteponer el punto de prioridad al titulo; la prioridad sigue conservandose internamente para TTL/urgencia.
- En Seguimiento Especial, el emoji de catalogo se agrega como indicador semantico al final del titulo Push.
- Notificaciones fuera de UNITED conservan el formato de prioridad anterior.

## Validacion ejecutada

- `node --check` en los 4 archivos productivos modificados: PASS.
- `npm run check`: PASS.
- `npm test`: 55/55 PASS.
- `node --test ../validation/push-priority.test.js`: 3/3 PASS.

## No incluido

- No SQL.
- No cambios de Aiven.
- No cambios a relaciones Evento-Rol.
- No cambios al Fix `SOLO_FOLLOWERS` ya aplicado.
