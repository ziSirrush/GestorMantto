# Dashboard Call Center — MTBC Año Actual y U365

Fecha: 15 de julio de 2026

## Alcance

Se integraron los indicadores corporativos MTBC de United en Dashboard Call Center.

## Cambios

- Se consumen exclusivamente los endpoints del backend:
  - `/api/indicadores/mtbc/equipos`
  - `/api/indicadores/mtbc/proyectos`
- Se cargan todas las páginas disponibles de ambos endpoints.
- Se agregaron dos KPIs:
  - `Prom. MTBC Año Actual`
  - `Prom. MTBC U365`
- Los KPIs muestran el promedio de los indicadores por equipo devueltos por backend y respetan el filtro de Zona Operativa.
- El filtro de fechas del Call Center no modifica estos dos KPIs corporativos.
- Se agregaron `MTBC Año Actual` y `MTBC U365` a:
  - Llamadas U365 por Proyecto.
  - Llamadas U365 por Equipo.
  - Equipos con más llamadas del período.
  - Proyectos con más llamadas del período.
- No se agregó MTBC a tablas de tickets individuales.
- Se corrigió el icono de la KPI `En críticos` para usar `💥`.

## Regla de datos

El frontend no recalcula el MTBC individual. Solo presenta `mtbc_anio` y `mtbc_365` entregados por el backend United. El promedio mostrado en los KPIs es una agregación visual de esos resultados por equipo.

## Archivos modificados

- `modules/callcenter/callcenter.js`
- `modules/callcenter/callcenter.html`

## Validación

- Sintaxis JavaScript validada con `node --check`.
- No se modificó backend, base de datos, PDF ni otros módulos.
