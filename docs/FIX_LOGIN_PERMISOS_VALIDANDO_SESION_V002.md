# FIX Login y permisos - Validando sesion V002

## Causa
La pantalla `auth-bootstrap-screen` utiliza `z-index: 99999`, mientras el modal de permisos utilizaba `z-index: 10000`. El flujo de autenticacion esperaba la validacion de permisos antes de ejecutar `showApp()`, que era la funcion encargada de ocultar la pantalla bootstrap. El modal si se creaba, pero quedaba oculto detras de "Validando sesion".

## Cambios
- `core/auth.js`: oculta la pantalla bootstrap antes de abrir el flujo obligatorio de permisos.
- `styles/device-permissions.css`: eleva el modal a `z-index: 100000` como proteccion adicional.

## Importante para Push obligatorio
Si `WEB_PUSH_ENABLED` esta desactivado, Push se reportara como `NO_DISPONIBLE`. Como los cuatro permisos fueron definidos como obligatorios, el usuario no podra completar el acceso hasta configurar en Azure:
- `WEB_PUSH_ENABLED=true`
- `WEB_PUSH_VAPID_PUBLIC_KEY`
- `WEB_PUSH_VAPID_PRIVATE_KEY`
- `WEB_PUSH_SUBJECT`

## Validacion
- Sintaxis JavaScript validada con `node --check core/auth.js`.
