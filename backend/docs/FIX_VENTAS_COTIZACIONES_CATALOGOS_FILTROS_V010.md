# FIX Ventas Cotizaciones V010

## Cambios

- El filtro Año usa los años reales de `COALESCE(fecha_cotizacion, fecha_solicitud)`.
- Por defecto selecciona el año en curso.
- La opción `Todos` elimina el filtro anual sin borrar históricos.
- Listado y KPIs reciben el mismo parámetro `anio`.
- Asesores y administrativos se obtienen de `usuarios_rel_admin`, unidos con usuarios activos del área Ventas.
- Las zonas se obtienen únicamente de los valores existentes en `ventas_cotizaciones_cor.zona`.
- No se usan catálogos dummy.

## API

`GET /api/ventas/cotizaciones?anio=2026`

`GET /api/ventas/cotizaciones?anio=todos`

La ausencia de `anio` mantiene como valor predeterminado el año actual.

## SQL

No requiere migración.
