# FIX_PUSH_ACTIVO_POR_DEFECTO_PREFERENCIA_USUARIO_V001

## Causa

El envio Push dependia de la bandera global `WEB_PUSH_ENABLED`. Si la variable estaba ausente o en `false`, el job completo quedaba desactivado desde codigo aunque los usuarios tuvieran Push autorizado.

Ademas, el job de despacho no filtraba las notificaciones usando la preferencia Push individual del usuario.

## Cambios

- Se elimina `WEB_PUSH_ENABLED` como interruptor global.
- Push se considera disponible automaticamente cuando las tres variables VAPID son validas.
- Campana y Push quedan activos por defecto cuando el usuario no ha guardado una preferencia explicita.
- El despacho Push respeta `notificacion_preferencias.push` y `silenciada`.
- Los eventos obligatorios conservan su comportamiento obligatorio.
- Se elimina `WEB_PUSH_ENABLED` de `.env.example`.

## Variables tecnicas requeridas

Estas variables no desactivan Push; son credenciales tecnicas indispensables para enviarlo:

- `WEB_PUSH_VAPID_PUBLIC_KEY`
- `WEB_PUSH_VAPID_PRIVATE_KEY`
- `WEB_PUSH_SUBJECT`

## Archivos modificados

- `backend/.env.example`
- `backend/src/modules/push-notifications/push-notifications.sender.js`
- `backend/src/modules/push-notifications/push-notifications.repository.js`
- `backend/src/services/notifications/notification.repository.js`
- `backend/src/services/notifications/notification.service.js`

## Validaciones

- `node --check` correcto en los cuatro archivos JavaScript.
- El validador estructural reconoce correctamente todos los archivos backend modificados.
- No se modificaron frontend, Service Worker, permisos de dispositivo ni tablas.
