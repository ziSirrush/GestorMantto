# Dashboard y Reporte de Logística V0.3

## Cambios
- Retirados los KPI del Dashboard Logística.
- El pipeline permanece como resumen principal del Dashboard.
- Clic en cualquier etapa del pipeline navega a `Reporte de Logística`.
- El reporte abre automáticamente el acordeón correspondiente al estatus seleccionado.
- Integrado el tab `Detalle` del HTML de desarrollo como módulo `Reporte de Logística`.
- El reporte consume datos reales desde `GET /api/logistica?limit=5000`.
- Se mantiene el detalle flotante al seleccionar una fila.

## Archivos modificados
- `index.html`
- `core/router.js`
- `modules/dashboard-logistica/dashboard-logistica.js`
- `modules/dashboard-logistica/dashboard-logistica.css`

## Archivos nuevos
- `modules/reporte-logistica/reporte-logistica.js`
- `modules/reporte-logistica/reporte-logistica.css`
