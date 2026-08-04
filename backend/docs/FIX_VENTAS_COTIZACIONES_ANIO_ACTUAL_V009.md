# FIX Ventas Cotizaciones - Año actual V009

## Alcance

Este FIX modifica únicamente el módulo Cotizaciones.

## Regla temporal

El listado principal y los KPI consideran únicamente registros cuya fecha de referencia pertenezca al año calendario actual.

Fecha de referencia:

1. `fecha_cotizacion`, cuando tiene valor.
2. `fecha_solicitud`, cuando `fecha_cotizacion` es NULL.
3. Si ambas fechas son NULL, el registro no aparece en el listado ni en los KPI del módulo Cotizaciones.

El intervalo SQL es:

```sql
COALESCE(fecha_cotizacion, fecha_solicitud) >= MAKEDATE(YEAR(CURDATE()), 1)
AND COALESCE(fecha_cotizacion, fecha_solicitud) < MAKEDATE(YEAR(CURDATE()) + 1, 1)
```

El límite superior exclusivo incluye correctamente todo el 31 de diciembre aunque las columnas lleguen a manejar hora.

## KPI

El texto `Embudo activo` cambia a `En proceso`.

Los KPI conservados son:

- Total
- En proceso
- Vendidas
- Perdidas
- Equipos

Todos se calculan sobre el mismo año y el mismo alcance de visibilidad del usuario.

## No modificado

- No se modifican Dashboard, Vendidos, Perdidos ni Proyección.
- No se ejecuta migración SQL.
- No se cambia el historial almacenado.
- No se alteran permisos ni reglas de visibilidad comercial.
