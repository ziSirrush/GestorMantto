# FASE 1 — Permisos nativos persistentes V001

## Causa encontrada

La sincronización automática ejecutada al iniciar sesión enviaba el resultado completo de `navigator.permissions` al backend. En navegadores que no pueden consultar cámara o micrófono, el resultado se convertía en `PENDIENTE`. El `UPSERT` posterior reemplazaba estados definitivos guardados anteriormente, por lo que los permisos parecían reiniciarse con cada login.

Además, la interfaz continuaba mostrando el resultado local incierto aunque el servidor conservara otro estado.

## Cambios aplicados

- Las solicitudes nativas continúan ejecutándose únicamente mediante una acción directa del usuario:
  - GPS con `navigator.geolocation.getCurrentPosition()`.
  - Cámara y micrófono con `navigator.mediaDevices.getUserMedia()`.
  - Notificaciones con `Notification.requestPermission()` y registro Push existente.
- La sincronización distingue entre:
  - `AUTO_LOGIN`.
  - `AUTO_REVALIDACION`.
  - `ACCION_USUARIO`.
- Una acción individual envía únicamente el permiso que se acaba de validar.
- El backend combina el estado recibido con el estado previo del dispositivo.
- `PERMITIDO` y `DENEGADO` son estados definitivos y sí se guardan.
- `PENDIENTE` y `NO_DISPONIBLE` no sustituyen un estado definitivo anterior.
- La interfaz adopta el estado consolidado devuelto por el backend, evitando que un resultado local incierto vuelva a mostrarse como pérdida del permiso.
- Se actualizó la versión de carga de `core/device-permissions.js` para evitar caché.

## Archivos modificados

- `index.html`
- `core/device-permissions.js`
- `backend/src/modules/device-permissions/device-permissions.service.js`

## Base acumulativa

Se utilizó la última versión publicada del 31/07 y se conservaron los cambios aprobados del FIX responsive V002.

## Validaciones realizadas

- `node --check core/device-permissions.js`.
- `node --check backend/src/modules/device-permissions/device-permissions.service.js`.
- `npm run check` del backend.
- Confirmación de rutas existentes:
  - `GET /api/device-permissions/status`.
  - `POST /api/device-permissions/sync`.
- Sin cambios en tablas SQL, rutas, controladores, `/api/health` ni módulos en Nevera.

## Prueba recomendada

1. Activar un permiso desde el botón correspondiente.
2. Cerrar sesión e iniciar nuevamente.
3. Confirmar que el estado sigue en `PERMITIDO`.
4. Bloquear manualmente el permiso desde el navegador o sistema.
5. Volver a validar desde Mi Perfil.
6. Confirmar que cambia a `DENEGADO` y permanece así después de otro inicio de sesión.
