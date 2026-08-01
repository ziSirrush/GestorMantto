# FIX Permisos móvil multinavegador V005

## Problemas corregidos
- En PWA móvil podía mostrarse únicamente `Continuar` porque el navegador conservaba recursos anteriores o los botones individuales quedaban comprimidos.
- Safari/iOS podía lanzar `Can't find variable: Notification` al acceder al objeto global sin verificar su existencia.
- La solicitud Push ocurría después de operaciones asíncronas y Safari podía considerar perdido el gesto directo del usuario.

## Corrección
- Todas las referencias usan `window.Notification` solo después de comprobar soporte.
- Push solicita permiso directamente desde el clic individual y después registra Service Worker/suscripción.
- GPS, cámara, micrófono y Push mantienen botones independientes.
- En pantallas de hasta 480 px cada botón ocupa una fila completa y permanece visible.
- Se actualizaron versiones de recursos en `index.html` para invalidar caché de navegador/PWA.
- El Service Worker usa `skipWaiting()` y `clients.claim()` para adoptar la nueva versión con mayor rapidez.
- `Continuar` sigue permitiendo entrar aunque no se active ningún permiso; el recordatorio permanece cada 24 horas.

## Compatibilidad
- Chrome, Edge y Opera basados en Chromium.
- Safari/iOS cuando la versión y el modo instalado soporten Web Push.
- Navegadores sin `Notification`, `PushManager` o Service Worker muestran Push como no disponible sin romper los demás permisos.

## Archivos modificados
- `index.html`
- `service-worker.js`
- `core/device-permissions.js`
- `core/push-notifications.js`
- `styles/device-permissions.css`
