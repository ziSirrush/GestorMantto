# FIX EMERGENCIA API PANEL CONTROL COMPATIBLE V004

## Objetivo
Restaurar el arranque de la API después del error fatal:

`TypeError: argument handler must be a function`

registrado en `src/routes/panel-control.routes.js:8` al intentar usar `controller.getBootstrap`.

## Archivos incluidos
- `backend/src/routes/panel-control.routes.js`
- `backend/src/controllers/panel-control.controller.js`

Ambos archivos provienen de la última versión completa estable compartida en `Revision de interacciones.zip`, por lo que se entregan como pareja compatible.

## Alcance
- No modifica Aiven.
- No modifica roles, usuarios ni permisos guardados.
- No modifica módulos de Ventas.
- Restaura temporalmente el backend de Panel de Control al estado estable anterior a la Fase 6.

## Despliegue
Reemplazar ambos archivos y desplegar solamente el backend.

## Validación esperada
El log debe volver a mostrar:

`Mantto Gestor API escuchando en http://localhost:8080`

sin el error fatal de `panel-control.routes.js:8`.

El mensaje sobre `sistema_permisos_dispositivo` es un error separado y no impide por sí mismo que la API escuche en el puerto 8080.
