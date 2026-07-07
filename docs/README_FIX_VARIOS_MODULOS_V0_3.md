# Fix varios módulos v0.3

Fecha: 2026-07-07

## Resumen del Día
- Proyecto clickeable abre ventana flotante de detalle de proyecto.
- Equipo clickeable abre ventana flotante de detalle de equipo.
- Se mantiene el comportamiento de ticket en ventana flotante.

## Equipos Críticos
- Renglón de Equipos Críticos abre ventana flotante combinada:
  1. Detalle del Proyecto.
  2. Detalle del Equipo.
  3. Tickets relacionados al equipo.
- Proyecto, equipo y ticket dentro del detalle son clickeables.

## Dashboard Call Center
- Proyecto clickeable abre ventana flotante de detalle de proyecto.
- Equipo clickeable abre ventana flotante de detalle de equipo.
- Aplica en tablas y detalles derivados de KPIs/barras/donas.

## Movimientos de Portafolio
- Se fortaleció el manejo de respuesta inválida del backend.
- El módulo ahora usa fallback local `http://localhost:3001` si `MANTTO_API_BASE` no está disponible.

## Archivos modificados
- `pruebas/index.html`
- `pruebas/core/details.js`
- `pruebas/modules/resumen-dia/resumen-dia.js`
- `pruebas/modules/equipos-criticos/equipos-criticos.js`
- `pruebas/modules/equipos-criticos/equipos-criticos.css`
- `pruebas/modules/callcenter/callcenter.js`
- `pruebas/modules/callcenter/callcenter.css`
- `pruebas/modules/movimientos-portafolio/movimientos-portafolio.js`
