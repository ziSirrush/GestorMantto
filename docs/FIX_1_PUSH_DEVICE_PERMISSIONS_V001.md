# FIX 1 - Push y permisos por dispositivo

Fecha: 2026-08-03
Estado: Listo para pruebas

## Cambios

- Push espera `navigator.serviceWorker.ready` antes de usar `PushManager.subscribe()`.
- Se valida que el Service Worker tenga una instancia activa.
- Se agrega registro detallado de errores SQL para `/api/device-permissions/status` y `/api/device-permissions/sync`.
- Se incluye una migracion incremental e idempotente para las tablas de permisos del dispositivo.
- `usuarios_dispositivos.id_usuario` se conserva como `BIGINT` firmado para coincidir con `usuarios.id_SB`.
- Se actualiza el cache-buster de `push-notifications.js`.
- Se corrigen los roles de acceso total de Ventas a `1, 4, 34, 39`.
- Los nombres de rol permanecen normalizados en minusculas porque el servicio convierte nombres y puestos mediante `normalize()` antes de compararlos.

## Archivos modificados

- `core/push-notifications.js`
- `backend/src/modules/device-permissions/device-permissions.controller.js`
- `backend/src/modules/ventas/ventas-visibility.service.js`
- `index.html`

## Archivo SQL nuevo

- `database/FIX_1_PUSH_DEVICE_PERMISSIONS_V001.sql`

## Orden de despliegue

1. Ejecutar el SQL en Aiven.
2. Desplegar backend.
3. Publicar frontend.
4. Cerrar y abrir la PWA o recargar sin cache.
5. Iniciar sesion y probar sincronizacion de permisos y activacion Push.

## Validacion esperada

- `/api/device-permissions/sync` responde HTTP 200.
- No aparece `Subscription failed - no active service worker`.
- El registro del dispositivo queda en `usuarios_dispositivos`.
- La suscripcion Push queda vinculada mediante `id_dispositivo` cuando corresponda.
