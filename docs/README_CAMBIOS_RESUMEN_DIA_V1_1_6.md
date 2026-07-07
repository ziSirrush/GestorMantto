# Cambios Resumen del Dia V1.1.6 - 2026-07-07

## Alcance

- Se eliminaron del modulo Resumen del Dia las tablas:
  - Equipos con mas llamadas del periodo.
  - Proyectos con mas llamadas del periodo.
- Los detalles generados desde KPIs, graficas y barras ahora se abren en una ventana flotante/modal, sin desplazar el contenido del modulo.
- Al seleccionar un tab del panel lateral, el panel se contrae automaticamente.

## Archivos modificados

- docs/index.html
- pruebas/core/app.js
- pruebas/modules/resumen-dia/resumen-dia.html
- pruebas/modules/resumen-dia/resumen-dia.css
- pruebas/modules/resumen-dia/resumen-dia.js

## Validacion tecnica

- `node --check pruebas/modules/resumen-dia/resumen-dia.js`
- `node --check pruebas/core/app.js`

Ambos archivos JS pasaron validacion de sintaxis.
