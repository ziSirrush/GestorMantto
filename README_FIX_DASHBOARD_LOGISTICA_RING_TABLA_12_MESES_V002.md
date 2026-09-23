# FIX_DASHBOARD_LOGISTICA_RING_TABLA_12_MESES_V002

## Objetivo
Corregir el desglose mensual bajo el ring de contenedores para mostrar los 12 meses del año actual en dos tablas compactas 7x3 dentro de la misma tarjeta.

## Diseño
- Tabla izquierda: Enero a Junio.
- Tabla derecha: Julio a Diciembre.
- Cada tabla contiene: Mes | 20' DC | 40' HQ.
- El ring mantiene el total anual.
- El criterio temporal se mantiene sin cambios: año y mes de `fecha_salida_estimada` (ETD).
- Los meses sin registros se muestran en 0.

## Cambios técnicos
### Backend
`backend/src/modules/logistica-dashboard/logistica-dashboard.repository.js`
- Amplía el desglose mensual de `BETWEEN 1 AND 6` a `BETWEEN 1 AND 12`.

`backend/src/modules/logistica-dashboard/logistica-dashboard.service.js`
- Normaliza siempre 12 meses, de Enero a Diciembre.
- Mantiene `contenedores_20_dc` y `contenedores_40_hq` como conteos físicos.

### Frontend
`modules/dashboard-logistica/dashboard-logistica.js`
- Reemplaza la única tabla Enero-Junio por dos tablas lado a lado.
- Izquierda: Enero-Junio.
- Derecha: Julio-Diciembre.

`modules/dashboard-logistica/dashboard-logistica.css`
- Agrega grid de dos columnas para las tablas mensuales.
- En pantallas <=560px las tablas se apilan para conservar legibilidad.

`core/module-loader.js`
- Cache bust actualizado a `20260923-dashboard-ring-meses-v002`.

## Validación realizada
- `node --check` sobre JS frontend, loader, repository, service y test: OK.
- `node tests/logistica_dashboard_ring_meses.test.js`: OK.
- `node tests/logistica_dashboard_fase1.test.js`: 6/6 OK en la copia de trabajo completa.
- `backend npm run check`: OK en la copia de trabajo completa.
- No se realizó despliegue ni modificación remota.

## Archivos del FIX
- `backend/src/modules/logistica-dashboard/logistica-dashboard.repository.js`
- `backend/src/modules/logistica-dashboard/logistica-dashboard.service.js`
- `modules/dashboard-logistica/dashboard-logistica.js`
- `modules/dashboard-logistica/dashboard-logistica.css`
- `core/module-loader.js`
- `tests/logistica_dashboard_ring_meses.test.js`
