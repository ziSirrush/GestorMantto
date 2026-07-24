# FIX V031.3.1 — Restauración de criticidad por período en Detalle Proyecto

## Base utilizada

`Ver Publicada 1335hrs-2407.zip`

## Problema confirmado

La integración posterior del FIX V032/V032.1 reemplazó `core/details.js` con una versión que volvió a mostrar:

- KPI **Equipos críticos — Año actual**.
- KPI **Críticos del período** con emoji `‼️`.
- Indicadores separados `CRITICO_PERIODO` y `CRITICO_ANIO` en la tabla.

El backend publicado ya conservaba correctamente la lógica única por período. El problema estaba limitado al renderizado del frontend.

## Corrección aplicada

- Se elimina nuevamente el KPI **Equipos críticos — Año actual**.
- Se mantiene únicamente **💥 Críticos del período**.
- La tabla de equipos utiliza `es_critico_periodo` para mostrar el indicador estándar `CRITICO` (`💥`).
- Se elimina el indicador anual de la tabla.
- La leyenda queda con:
  - `💥 Equipo crítico`.
  - `🛑 No funcionando`.
- Se preservan los cambios acumulados de V032/V032.1:
  - PDF Archivo del Equipo.
  - Botón **Ir a proyecto** en Detalle del Equipo.
  - Botón **Ir a proyecto** en Tickets del Equipo.
- Se actualiza la versión de caché de `core/details.js`.

## Archivos modificados

- `core/details.js`
- `index.html`

## Base de datos

No requiere cambios SQL.
