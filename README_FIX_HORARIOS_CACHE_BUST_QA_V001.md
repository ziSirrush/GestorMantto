# FIX_HORARIOS_CACHE_BUST_QA_V001

## Objetivo
Corregir el test de GitHub Actions que seguia esperando cache-bust anteriores a la integracion de Horarios Fases 1+2+3.

## Alcance
Se modifica unicamente:

- `validation/seguimiento-especial-notificaciones.test.js`

No se modifica codigo productivo, backend, SQL, sync de Tickets, Notificaciones ni archivos frontend.

## Cambio
Se actualizan tres expectativas del test `cache bust de cierre apunta a los archivos frontend corregidos` para que validen los valores actualmente integrados:

- `seguimiento-especial.js?v=20260914-human-time-v001`
- `core/module-loader.js?v=20260914-horarios-f2-v001`
- `core/router.js?v=20260914-human-time-v001`

La expectativa de `seguimiento-especial-global.js?v=20260909-seguimiento-especial-control-unico-v006` permanece sin cambios.

## Validacion
- `node --test ../validation/seguimiento-especial-notificaciones.test.js`: 27/27 PASS.
- `npm run check`: PASS.
- `npm test`: 37/38 PASS.

El unico fallo restante es `la campanita muestra la accion y consume la ruta masiva`, perteneciente a `tests/notificaciones-marcar-todas.test.js` y ajeno a este Fix de Horarios.
