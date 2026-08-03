# FASE 2 — Push VAPID con destino real V001

## Causa encontrada

La tabla `notificaciones_push_suscripciones` estaba vacía y el repositorio intentaba escribir una columna `id_dispositivo` que no existe en el dump `Dump20260801.sql`. Además, el job enviaba un push vacío: el Service Worker mostraba un texto genérico y solo abría la bandeja general.

## Cambios

- Registro de suscripción compatible con la estructura SQL real, sin agregar columnas.
- La resincronización del login ya no adelanta el cursor y no omite notificaciones pendientes.
- Envío Web Push cifrado `aes128gcm` con VAPID usando las variables existentes.
- Payload real por notificación: título, mensaje, tipo, acción, referencia, ruta y `notificationId`.
- `404` y `410` desactivan la suscripción vencida.
- El Service Worker abre el destino real.
- `TICKET_COMENTARIO` abre Detalle Ticket y posiciona el chat mediante la lógica ya aprobada del router.
- No se marcan notificaciones como leídas por el envío push; se mantienen las reglas actuales de apertura.

## Archivos modificados

- `index.html`
- `service-worker.js`
- `core/push-notifications.js`
- `backend/src/modules/push-notifications/push-notifications.sender.js`
- `backend/src/modules/push-notifications/push-notifications.service.js`
- `backend/src/modules/push-notifications/push-notifications.repository.js`
- `backend/src/jobs/pushNotifications.job.js`

## Variables requeridas en Azure

- `WEB_PUSH_ENABLED=true`
- `WEB_PUSH_VAPID_PUBLIC_KEY`
- `WEB_PUSH_VAPID_PRIVATE_KEY`
- `WEB_PUSH_SUBJECT`
- `WEB_PUSH_BATCH_SIZE` opcional
- `WEB_PUSH_DISPATCH_INTERVAL_MS` opcional
- `WEB_PUSH_NOTIFICATIONS_PER_CYCLE` opcional

## Base SQL

No requiere migración. Respeta las tablas existentes:

- `sup_notificaciones`
- `notificaciones_push_suscripciones`
- `usuarios_dispositivos`
