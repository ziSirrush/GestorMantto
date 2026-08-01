# FIX crítico: destino real de notificaciones V001

## Problema
Las notificaciones con `ruta_destino` como `detalle:ticket:<ticket>` se enviaban al router como si toda la cadena fuera el nombre de un módulo. El router no reconocía ese módulo y mostraba la pantalla genérica "En construcción".

## Corrección
- `modules/home/home.js` traduce rutas `detalle:ticket:*`, `detalle:proyecto:*` y `detalle:equipo:*` al módulo real `detalle` con su `type` e `id`.
- `core/router.js` agrega una normalización central en `openTarget()` como protección para cualquier origen futuro que entregue rutas compuestas.
- Se conserva `notificationId` para marcar la notificación como abierta.
- Para tickets se usa primero el número incluido en `ruta_destino`; si no existe, se usa `id_referencia`.

## Resultado esperado
Una notificación con:

```
ruta_destino = detalle:ticket:252462
```

abre:

```
ManttoDetails.openTicket('252462')
```

mediante la ruta real `detalle`, sin pasar por el placeholder de módulos en desarrollo.

## Archivos modificados
- `core/router.js`
- `modules/home/home.js`

## Base
El router conserva las rutas acumuladas de Prospección Fase 4A. No modifica backend ni base de datos.
