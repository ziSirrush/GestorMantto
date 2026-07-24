# FIX V031.3 - Dirección - Críticos en Detalle Proyecto

Base utilizada: `Ver Publicada 1205hrs - 2407.zip`

## Decisión aplicada

El módulo Proyectos usa una sola definición de equipo crítico: la configuración vigente de Equipos Críticos.

- Parámetro de período: `criticos_periodo`
- Parámetro de mínimo de fallas: `criticos_fallas`
- Responsabilidad considerada: BLT
- Solo equipos activos, no inactivos y no marcados como "No en Servicio"

## Cambios

### Backend
Archivo: `backend/src/modules/proyectos/proyectos.service.js`

- Se eliminó el cálculo anual fijo de equipos críticos.
- Se eliminó `equipos_criticos_anio`.
- Se eliminó `es_critico_anio` por equipo.
- Se conserva únicamente `equipos_criticos_periodo` y `es_critico_periodo`.

### Frontend
Archivo: `core/details.js`

- Se eliminó el KPI "Equipos críticos - Año actual".
- Se mantiene únicamente el KPI `💥 Críticos del período`.
- La tabla de equipos usa `💥` para los equipos críticos del período vigente.
- Se eliminó el indicador anual de la tabla.
- La leyenda queda con:
  - `💥 Equipo crítico`
  - `🛑 No funcionando`
- La cuadrícula de KPIs de equipos se ajustó de cuatro a tres columnas.

### Caché
Archivo: `index.html`

- Se actualizó la versión de `core/details.js` a `v031_3_dir`.

## Validaciones realizadas

- `node --check backend/src/modules/proyectos/proyectos.service.js`
- `node --check core/details.js`
- `npm run check` en backend
- Búsqueda de referencias residuales a:
  - `equipos_criticos_anio`
  - `es_critico_anio`
  - `CRITICO_ANIO`

No requiere cambios SQL.
