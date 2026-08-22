# FIX N4.3 - Refresco real del catalogo de Notificaciones

Fecha: 2026-08-15

## Hallazgo

La lista `Interacciones` no esta hardcodeada en el frontend. El contador visible se obtiene de `GET /api/panel-control/notificaciones/matriz`.

N2 consulta dinamicamente `notificacion_eventos WHERE activo = 1`, pero la respuesta GET no tenia una politica explicita anti-cache y el boton general `Recargar datos` ejecutaba solamente `loadBootstrap()`, no `loadNotificationMatrix()` cuando el usuario estaba en la pestana Notificaciones.

Por eso una pestana abierta antes de ejecutar el SQL podia conservar el catalogo anterior de 11 eventos y el boton Recargar datos no actualizaba ese catalogo.

## Cambios

### Frontend
`modules/panel-control/panel-control.js`

- `loadNotificationMatrix()` ahora solicita la matriz con `cache: 'no-store'`.
- Agrega un parametro de cache-busting `_={timestamp}` para evitar una respuesta GET reutilizada por navegador/proxy.
- Si la pestana activa es `Notificaciones`, el boton `Recargar datos` recarga directamente la matriz de notificaciones.
- No cambia el modelo de 3 paneles de N4.1/N4.2.
- Conserva Interacciones como maestro y el orden alfabetico de Roles.

### Backend
`backend/src/controllers/panel-control-notificaciones.controller.js`

- GET y PUT de la matriz responden con:
  - `Cache-Control: private, no-store, no-cache, must-revalidate`
  - `Pragma: no-cache`
  - `Expires: 0`
- La consulta a `notificacion_eventos` sigue siendo dinamica. No se hardcodean eventos.

## Sin cambios

- No modifica tablas.
- No incluye SQL adicional.
- No modifica N1, N3, N5 ni N6.
- No asigna roles ni politicas automaticamente.
- No modifica Zona Operativa ni Zona Administrativa.

## Verificacion esperada

Si en la misma base de datos que consume el backend existen activos:

- `FALLA_EQUIPO_CRITICO`
- `PERSONA_ATRAPADA`
- `NUEVO_EQUIPO_CRITICO`

al abrir o pulsar `Recargar datos` dentro de Panel de Control > Notificaciones, el endpoint debe volver a consultar Aiven y las tres interacciones deben aparecer sin reiniciar el navegador.

Si despues de este FIX siguen apareciendo 11, la causa ya no puede ser la capa visual/cache de N4: debe verificarse que esas tres filas existan con `activo = 1` en la misma base/esquema al que esta conectado el backend desplegado.
