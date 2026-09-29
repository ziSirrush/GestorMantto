# ADR 2026-09-29 — Seguimiento Especial · TICKET · Detalle frontend V001

## Estado

Implementado como **Fase 3/4** del alta de TICKET en Seguimiento Especial.

## Base

- Repositorio fuente: `ziSirrush/GestorMantto`
- Rama: `main`
- Commit base verificado: `f69aa5d40796c5976cf8d59eb6f6f99dbd930299` — `Version 092826.3`
- Dependencia funcional: Fase 1 `FASE_1_SEGUIMIENTO_ESPECIAL_TICKET_BACKEND_V001`
- Dependencia funcional: Fase 2 `FASE_2_SEGUIMIENTO_ESPECIAL_TICKET_NOTIFICACIONES_V001`

## Contexto

Fase 1 creó la persistencia/API para `TICKET` sobre la tabla general `seguimiento_especial`. Fase 2 conectó esa suscripción directa al motor actual de notificaciones. El frontend global de Seguimiento Especial ya montaba un control personal en Detalle Proyecto y Detalle Equipo, pero excluía expresamente `ticket` de los targets administrables.

La Fase 3 debe permitir que un usuario autorizado active o desactive Seguimiento Especial desde el Detalle Ticket sin construir todavía el listado general de Tickets, reservado a Fase 4.

## Decisión

1. El control global existente se reutiliza; no se crea un componente paralelo para Ticket.
2. `isManttoTarget()` acepta `proyecto`, `equipo` y `ticket`, conservando la exclusión de referencias Corellian/Instalaciones.
3. Detalle Ticket consulta:
   - `GET /api/tickets/:ticket/seguimiento-especial`
4. El switch persiste mediante:
   - `PUT /api/tickets/:ticket/seguimiento-especial`
   - body `{ "activo": true|false }`
5. `setTicket()` realiza recarga selectiva del estado local; no dispara `refresh(true)` de Portafolio.
6. La sesión mantiene un `trackedTickets` únicamente para Tickets consultados desde detalle. Esto permite decorar con `SEGUIMIENTO_ESPECIAL` el encabezado del detalle sin adelantar el listado de Fase 4.
7. La decoración textual transversal continúa limitada a Proyecto/Equipo. Fase 3 no empieza a colocar estrellas en cada texto que coincida con un número de Ticket.
8. El modo Visor continúa bloqueando Seguimiento Especial personal.
9. Se conserva el mismo permiso técnico vigente:
   `PORTAFOLIO_SEGUIMIENTO_ESPECIAL_SEGUIMIENTO_PROYECTO_EQUIPO.GESTIONAR_SEGUIMIENTO`.
10. No se modifica `portafolio_interes`, la tabla `seguimiento_especial`, rutas backend ni productores de notificaciones.
11. `core/module-loader.js` cambia únicamente el cache-bust del script global para garantizar que el navegador cargue esta versión.

## Límite de Fase 3

No se implementa en esta fase:

- listado/pestaña Tickets dentro de la pantalla Seguimiento Especial;
- consulta global `GET /api/seguimiento-especial/tickets` desde frontend;
- decoración de Tickets en tablas/listados generales;
- SQL;
- cambios de permisos;
- cambios de notificaciones.

Todo lo anterior que corresponda a la pantalla/listado queda para Fase 4.

## Resultado funcional

En `Detalle · Ticket 254013`, por ejemplo, el usuario autorizado obtiene el mismo control personal ya utilizado por Proyecto/Equipo. Al activarlo, únicamente ese Ticket pasa a Seguimiento Especial. Su Proyecto, Equipo y otros Tickets no son agregados por la acción frontend.
