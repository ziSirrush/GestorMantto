# FIX 3 — Notificaciones críticas y políticas efectivas V001

**Proyecto:** Mantto Gestor  
**Fecha:** 17/08/2026  
**Base:** lote Pre deploy Cobranza Uni antes de producción  
**Alcance:** backend de Tickets + lectura de Campana/estado de Notificaciones.

## Problemas corregidos

### 1. Doble generación de eventos críticos de Tickets
Los eventos:
- `FALLA_EQUIPO_CRITICO`
- `PERSONA_ATRAPADA`
- `NUEVO_EQUIPO_CRITICO`

estaban implementados simultáneamente en el controlador Legacy y en el servicio dedicado `ticket-critical-notifications_uni.service.js` invocado por la fachada `data.controller.js`.

Esto permitía evaluar/generar el mismo evento por dos caminos durante el mismo sync.

### Solución
- Legacy deja de calcular y emitir esos tres eventos.
- Se elimina del sync Legacy el snapshot crítico, la lista de tickets insertados para N6 crítico y el `SAVEPOINT n6_notificaciones` destinado a esos tres eventos.
- `data.controller.js` conserva como único punto de integración el servicio `ticket-critical-notifications_uni.service.js`.
- Legacy conserva intacto el flujo N6 de `COMENTARIO` de Ticket y sus destinatarios relacionados.

## 2. Campana y contador no aplicaban política efectiva
`/api/notificaciones` y `/api/notificaciones/estado` leían directamente `sup_notificaciones` y podían incluir registros cuyo canal efectivo era solo Push o estaba silenciado.

### Solución
`notificaciones.repository.js` reutiliza el helper general existente `bellVisibilitySql_gnral()` y aplica la misma política efectiva a:
- listado de Campana;
- contador/cursor ligero de estado.

La visibilidad considera:
- Rol Principal activo y único;
- política `OBLIGATORIA` heredada del Rol Principal;
- política `OPCIONAL`;
- preferencia individual `campana`;
- `silenciada`;
- `campana_default` del evento;
- compatibilidad Legacy para eventos todavía no incorporados a la matriz.

No se modifica el motor Push; este ya reutiliza `pushVisibilitySql_gnral()` del mismo archivo de política.

## Archivos modificados
- `backend/src/controllers/data.controller.legacy.js`
- `backend/src/modules/notificaciones/notificaciones.repository.js`

## No modificado
- `backend/src/controllers/data.controller.js`
- `backend/src/services/notifications/ticket-critical-notifications_uni.service.js`
- `backend/src/services/notifications/notification.service.js`
- `backend/src/services/notifications/notification-policy.js`
- frontend;
- Panel de Control;
- SQL / estructura Aiven.

## Validaciones
- `node --check` de los archivos modificados: PASS.
- `node --check` de fachada, servicio crítico, política y módulo Notificaciones relacionado: PASS.
- `npm run check`: PASS.
- Confirmado que Legacy ya no contiene ninguno de los tres códigos de evento crítico: PASS.
- Confirmado que Legacy conserva `COMENTARIO` y `n6CreateTicketCommentNotification`: PASS.
- Confirmado que la fachada continúa usando `captureBeforeSync_uni()` + `processAfterSync_uni()`: PASS.
- Confirmado que Campana y `/estado` incluyen la política por Rol Principal, obligatoria/opcional, silenciado y canal Campana: PASS.

## SQL
Este FIX no agrega ni modifica SQL. La activación/configuración de los tres eventos sigue dependiendo de los SQL ya incluidos en el lote general antes de producción.

## Deploy
Requiere redeploy de backend después de integrarlo al lote.
