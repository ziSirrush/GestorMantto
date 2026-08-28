# FIX_CRITICOS_DESTINO_TICKET_V001

Fecha: 27/08/2026  
Base revisada: `c7b6bba7b3be8356b5277252c0bf5d9f88980cb6` — `Update Notificaciones 082726.2 - Notificaciones`

## Objetivo

Alinear el catalogo `notificacion_eventos` con el comportamiento productivo real de los tres eventos criticos base:

- `FALLA_EQUIPO_CRITICO`
- `NUEVO_EQUIPO_CRITICO`
- `PERSONA_ATRAPADA`

En la SABANA270826 los tres conservan `accion_destino = ABRIR_MODULO`, mientras el emisor productivo vigente los genera como notificaciones del Ticket causante con `accion = ABRIR_TICKET`, `idReferencia = ticket.id` y `ruta = detalle:ticket:<ticket>`.

Los dos eventos combinados ya fueron creados con `ABRIR_TICKET`:

- `PERSONA_ATRAPADA_EQUIPO_CRITICO`
- `PERSONA_ATRAPADA_NUEVO_EQUIPO_CRITICO`

## Inventario revisado

1. `backend/src/controllers/data.controller.js`
   - La fachada envuelve `syncTickets` y delega el post-proceso critico a `ticket-critical-notifications_uni.service.js`.

2. `backend/src/controllers/data.controller.legacy.js`
   - En el `main` revisado ya no aparecen `FALLA_EQUIPO_CRITICO`, `NUEVO_EQUIPO_CRITICO` ni `PERSONA_ATRAPADA`; se elimino el escritor paralelo anterior.

3. `backend/src/services/notifications/ticket-critical-notifications_uni.service.js`
   - Declara los cinco codigos criticos.
   - Todos pasan por `emitTicketEvent_uni(...)`.
   - `emitTicketEvent_uni(...)` fija `accion: 'ABRIR_TICKET'`, `idReferencia: ticketId` y ruta `detalle:ticket:<ticket>`.

4. `backend/src/services/notifications/notification.service.js`
   - Si un emisor no sobreescribe la accion, usa `event.accion_destino` como fallback de catalogo.
   - Por eso mantener `ABRIR_MODULO` en catalogo era una inconsistencia real aunque el emisor actual estuviera protegido.

5. `core/router.js`
   - `ABRIR_TICKET` se resuelve directamente a `route: 'detalle'`, `type: 'ticket'`, usando `referenceId`.

## Cambio

Solo se actualiza:

```sql
notificacion_eventos.accion_destino = 'ABRIR_TICKET'
```

para los tres eventos base.

No se cambia `ruta_default`. El router puede resolver `ABRIR_TICKET` por accion + `id_referencia`, y el emisor productivo vigente ya proporciona ademas la ruta exacta del Ticket.

## Seguridad de la migracion

El SQL es idempotente y fail-closed:

- exige que existan los tres eventos activos;
- solo acepta como estado previo `ABRIR_MODULO` o `ABRIR_TICKET`;
- si cualquiera tiene una accion inesperada, no actualiza ninguna fila;
- si ya esta aplicado, no modifica filas.

## Archivos

- `backend/sql/20260827_FIX_CRITICOS_DESTINO_TICKET_V001.sql`
- `backend/sql/20260827_VERIFICAR_FIX_CRITICOS_DESTINO_TICKET_V001.sql`
- `validation/critical-destination-catalog.test.js`

No hay cambios de JavaScript productivo ni frontend.

## Orden de aplicacion

1. Ejecutar `20260827_FIX_CRITICOS_DESTINO_TICKET_V001.sql` en el entorno autorizado.
2. Confirmar que el postcheck devuelve los tres eventos con `ABRIR_TICKET` y `validacion = OK`.
3. Ejecutar el SQL de verificacion de solo lectura.
4. Validar un evento critico controlado en Local/GitHub Pages antes de promover a Produccion.

## Reversion

Si fuera necesario revertir exclusivamente este cambio y se confirma que el estado anterior era el de `SABANA270826.sql`:

```sql
UPDATE notificacion_eventos
SET accion_destino = 'ABRIR_MODULO'
WHERE codigo_evento IN (
  'FALLA_EQUIPO_CRITICO',
  'NUEVO_EQUIPO_CRITICO',
  'PERSONA_ATRAPADA'
)
  AND accion_destino = 'ABRIR_TICKET';
```

La reversion no debe ejecutarse si posteriormente se redefine formalmente el destino de alguno de esos eventos.
