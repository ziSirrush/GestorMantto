# Dashboard Operativo — MTBC Año Actual y U365

Fecha: 2026-07-15

## Alcance

Se integraron dos indicadores corporativos al Dashboard Operativo:

- Prom. MTBC Año Actual.
- Prom. MTBC U365.

Ambos consideran únicamente fallas con responsabilidad BLT y consumen los resultados calculados por el backend United.

## Fuente de datos

```text
GET /api/indicadores/mtbc/equipos
```

El frontend no recalcula el MTBC individual. Solo obtiene `mtbc_anio` y `mtbc_365` y presenta el promedio correspondiente a los equipos incluidos por los filtros activos del Dashboard Operativo.

## Comportamiento

Los filtros de Zona, Supervisor y Tipo de equipo determinan qué equipos participan en los dos promedios mostrados. El filtro de Mes conserva su función sobre servicio preventivo y Vo.Bo.; no modifica los períodos corporativos del MTBC.

No se agregó MTBC a las tablas de confirmación o histórico de servicios preventivos, porque esas tablas están orientadas al cumplimiento mensual y no al análisis de confiabilidad.

## Archivos modificados

- `modules/dashboard-operativo/dashboard-operativo.html`
- `modules/dashboard-operativo/dashboard-operativo.js`
- `modules/dashboard-operativo/dashboard-operativo.css`

## Validación

- Sintaxis JavaScript validada con `node --check`.
- No se modificó backend.
- No se modificó base de datos.
- No se modificaron PDFs.
