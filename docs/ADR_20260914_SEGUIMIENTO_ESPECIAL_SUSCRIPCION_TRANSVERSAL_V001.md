# ADR 2026-09-14 — Seguimiento Especial como suscripción transversal UNITED V001

## Estado

Aprobado para Fase 1 de programación.

## Contexto

El motor de Notificaciones ya resolvía usuarios de Seguimiento Especial y los fusionaba con los destinatarios nativos del evento. Sin embargo, después de esa resolución, los seguidores volvían a pasar por la matriz de roles del evento nativo. Un usuario autorizado para seguir un Proyecto/Equipo podía ser descartado con `SIN_ROL_ASOCIADO`, aun cuando el propio Seguimiento Especial ya había validado usuario activo, permiso efectivo y alcance UNITED/ZOP.

La regla funcional cerrada establece que Seguimiento Especial es una suscripción personal transversal a la actividad UNITED del Proyecto/Equipo seguido. No es un evento paralelo y no debe depender del rol nativo del evento.

## Decisión

1. El resolver de Seguimiento Especial sigue siendo la frontera de autorización del follower:
   - dominio `UNITED`;
   - seguimiento activo;
   - usuario activo;
   - permiso efectivo `PORTAFOLIO_SEGUIMIENTO_ESPECIAL_SEGUIMIENTO_PROYECTO_EQUIPO.GESTIONAR_SEGUIMIENTO`;
   - alcance UNITED completo o PORTAFOLIO + ZOP, según la implementación vigente.
2. Una vez autorizado por ese resolver, el follower recibe el mismo evento nativo sin volver a requerir rol en `notificacion_evento_roles`.
3. Para el follower autorizado, campana y push quedan activos porque el seguimiento es una suscripción explícita del usuario.
4. Los destinatarios normales continúan exactamente bajo la matriz de roles, alcance y preferencias nativas.
5. Si un usuario es destinatario normal y follower, se conserva una sola entrega por la deduplicación existente y se agrega el código visual `SEGUIMIENTO_ESPECIAL`.
6. La presentación visual continúa resolviéndose desde `estados_visuales`; no se hardcodea `⭐` en el motor.
7. Las exclusiones nativas ya existentes —incluida la exclusión del actor— no se modifican en esta fase.
8. Si un evento exige matriz de roles y esa matriz no está configurada, los destinatarios nativos se omiten, pero un follower ya autorizado por Seguimiento Especial sí puede recibir el evento registrado.
9. Esta Fase 1 no agrega productores de eventos. La conexión de todos los eventos UNITED faltantes corresponde a Fase 2.

## Consecuencias

- Un usuario sin rol receptor nativo puede recibir actividad de un Proyecto/Equipo que él mismo tiene autorizado en Seguimiento Especial.
- No se amplía el acceso UNITED: la autorización continúa dependiendo del resolver de Seguimiento Especial.
- No se altera la matriz de destinatarios normales.
- No se crean tablas, permisos ni eventos nuevos.
- No se cambia el sync de Tickets ni Portafolio.

## Validación mínima obligatoria

- follower autorizado sin rol nativo recibe evento + `SEGUIMIENTO_ESPECIAL`;
- destinatario normal sin rol sigue siendo omitido;
- normal + follower recibe una sola notificación con código visual;
- follower no depende de la zona top-level de la matriz cuando su contexto UNITED ya fue verificado por el resolver;
- `requireRoleMatrix` sin matriz no elimina al follower autorizado, pero sí mantiene bloqueados a los destinatarios nativos.
