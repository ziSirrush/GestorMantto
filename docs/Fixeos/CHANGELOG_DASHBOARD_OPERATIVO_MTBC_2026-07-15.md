# Dashboard Operativo — MTBC Año Actual y U365

Fecha: 2026-07-15

## Alcance

Los indicadores MTBC que antes se agregaban como promedios en el Dashboard Operativo fueron retirados porque esa agregación no corresponde a una fórmula oficial. Los alcances oficiales permanecen disponibles en Call Center, Equipos Críticos, Proyectos e Informes:

- MTBC Año Actual.
- MTBC U365.

Ambos consideran únicamente fallas con responsabilidad BLT y consumen los resultados calculados por el backend United.

## Fuente de datos

```text
GET /api/indicadores/mtbc/equipos
```

El Dashboard Operativo ya no obtiene ni promedia `mtbc_anio` y `mtbc_365`.

## Comportamiento

Los filtros de Zona, Supervisor, Tipo de equipo y Mes conservan su función sobre servicio preventivo y Vo.Bo.; no calculan MTBC.

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
