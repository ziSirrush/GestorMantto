# FIX Notificaciones Timer 10 segundos V001

## Objetivo
Actualizar automaticamente la campana y el contador de notificaciones nuevas sin recargar la pagina.

## Cambio aplicado
- Intervalo de consulta: 10 segundos.
- Consulta inmediata al iniciar la aplicacion autenticada.
- Consulta inmediata al volver a una pestana visible.
- El timer se detiene cuando la pestana queda oculta.
- Se evita iniciar una segunda consulta mientras la anterior sigue en curso.
- No modifica rutas, controladores, tablas ni logica de destinatarios.

## Archivo modificado
- `core/app.js`

## Validacion
- Sintaxis JavaScript validada con `node --check`.

## Aplicacion
Reemplazar `core/app.js` y recargar el frontend sin cache.
