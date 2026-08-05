# FIX — Reaplicar permisos nativos locales V001

## Causa

La versión vigente volvió a ejecutar `POST /api/device-permissions/sync` al abrir la aplicación y al validar cada permiso. Esto mezclaba permisos nativos del navegador con registros del backend y provocaba errores 500 y reaparición del asistente.

## Cambios

- Se eliminaron del flujo frontend todas las llamadas a:
  - `/api/device-permissions/sync`
  - `/api/device-permissions/status`
- GPS, cámara, micrófono y permiso de notificaciones se consultan y solicitan únicamente mediante las APIs nativas del navegador/PWA.
- Los estados definitivos confirmados (`PERMITIDO` y `DENEGADO`) se conservan únicamente en el `localStorage` del mismo dispositivo como respaldo para navegadores que no permiten consultar cámara o micrófono con `navigator.permissions.query()`.
- Un estado nativo definitivo prevalece sobre el respaldo local.
- `PENDIENTE` nativo utiliza el último estado local definitivo disponible.
- No se solicitan permisos automáticamente; las solicitudes siguen dependiendo de un clic explícito del usuario.
- La suscripción técnica Web Push se conserva mediante `ManttoPushNotifications.ensureEnabled()`, porque el servidor necesita endpoint y claves para enviar Push.
- Se actualizó el cache-buster de `core/device-permissions.js`.

## Archivos modificados

- `core/device-permissions.js`
- `index.html`

## No modificado

- Backend.
- SQL.
- Tablas `usuarios_dispositivos` o `sistema_permisos_dispositivo`.
- Servicio Web Push.
- Permisos del Panel de Control.

## Validación

- `node --check core/device-permissions.js`.
- Confirmación de cero referencias frontend a `/api/device-permissions/sync` y `/api/device-permissions/status`.
- Confirmación de conservación de `Notification.requestPermission()`, `getUserMedia()`, geolocalización y registro técnico Push.
