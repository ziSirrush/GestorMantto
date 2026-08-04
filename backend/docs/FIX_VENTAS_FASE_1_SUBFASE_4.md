# Ventas - Fase 1 / Subfase 4

## Objetivo
Cerrar la Fase 1 agregando KPIs básicos de Cotizaciones sobre las columnas reales de `ventas_cotizaciones_cor`, sin modificar otros módulos.

## Endpoint agregado

`GET /api/ventas/cotizaciones/kpis`

Requiere autenticación JWT y el permiso `VENTAS_COTIZACIONES_OPERACION.VER` creado en la Subfase 3.

## Filtros admitidos
Reutiliza la normalización de la Subfase 2:

- Búsqueda: `buscar`, `search` o `q`.
- Filtros: `estatus_proyecto`, `asesor`, `id_asesor`, `admin`, `id_admin`, `zona`, `estado`, `ciudad`, `tipo_proyecto`, `tipo_equipos`, `anio_mes_cotizacion`, `anio_actual`, `mx`, `activo`.
- Por defecto aplica `activo=1`.
- Para medir registros activos e inactivos juntos usar `activo=todos`.

## KPIs devueltos

- Total de cotizaciones.
- Activas e inactivas.
- Total y promedio de equipos.
- Cotizaciones con y sin asesor.
- Cotizaciones con y sin administrativo.
- Cotizaciones con y sin estatus.
- Distribución por estatus con total, equipos y porcentaje.
- Distribución por asesor con total, equipos y porcentaje.

## Decisión técnica
La tabla y el módulo suministrados no contienen columnas monetarias. Por esa razón no se agregaron montos cotizados, vendidos, perdidos ni ticket promedio; hacerlo habría requerido inventar columnas o reglas no sustentadas por el código entregado.

Tampoco se codificaron categorías fijas de ganado/perdido/cancelado, porque los valores reales del catálogo de `estatus_proyecto` no están definidos en los archivos recibidos. La respuesta entrega la distribución real por estatus para que el frontend pueda presentarla sin clasificaciones arbitrarias.

## Archivos modificados

- `backend/src/modules/ventas-cotizaciones/ventas-cotizaciones.routes.js`
- `backend/src/modules/ventas-cotizaciones/ventas-cotizaciones.controller.js`
- `backend/src/modules/ventas-cotizaciones/ventas-cotizaciones.service.js`
- `backend/src/modules/ventas-cotizaciones/ventas-cotizaciones.repository.js`
- `backend/docs/FIX_VENTAS_FASE_1_SUBFASE_4.md`

## Validaciones realizadas

- Sintaxis de los cuatro archivos JavaScript mediante `node --check`.
- Confirmación de la cadena ruta -> controlador -> servicio -> repositorio.
- Confirmación de que `/cotizaciones/kpis` está declarado antes de `/cotizaciones/:id`.
- Reutilización de filtros parametrizados de la Subfase 2.
- Protección con autenticación y permiso `VER` de la Subfase 3.
- Integridad del ZIP mediante `unzip -t`.

## Validación pendiente
No se ejecutaron consultas reales contra Aiven porque el entorno de trabajo no contiene las credenciales ni una copia de la tabla productiva. La sintaxis SQL se revisó contra las columnas utilizadas por el módulo entregado, pero la ejecución real debe validarse después del despliegue.
