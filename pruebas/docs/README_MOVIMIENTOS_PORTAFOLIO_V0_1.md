# Movimientos de Portafolio v0.1

Estado: Preparado / Pruebas
Fecha: 2026-07-07

## Cambios incluidos

- Se agregó el módulo `pruebas/modules/movimientos-portafolio/`.
- Se registró la vista `view-movimientos` en `pruebas/index.html`.
- Se conectó la ruta `movimientos` en `pruebas/core/router.js`.
- Se agregó el endpoint backend `GET /api/portafolio/movimientos`.
- Se dejó documentada la nevera temporal de los módulos trabajados hoy.

## Regla funcional extraída de Desarrollo

Movimientos de Portafolio compara el estatus actual del equipo contra el estatus del último corte mensual:

- `estatus_servicio` = estatus actual.
- `estatus_ul_mes` = estatus del último mes/corte.
- `estatus_ul_mes_fecha` = fecha del corte mensual, si existe.

El módulo clasifica los cambios como:

- `DEGRADADO`: antes estaba en servicio y ahora ya no está en servicio.
- `RECUPERADO`: antes no estaba en servicio y ahora está en servicio.
- `CAMBIO`: cualquier otro cambio de estatus.

## Nota importante de base de datos

El endpoint valida dinámicamente si la tabla `portafolio` tiene la columna `estatus_ul_mes`.

Si la columna no existe, el endpoint no rompe la app: devuelve una respuesta vacía con advertencia. Para que el módulo muestre movimientos reales, Aiven debe tener al menos:

```sql
ALTER TABLE portafolio
  ADD COLUMN estatus_ul_mes VARCHAR(100) NULL,
  ADD COLUMN estatus_ul_mes_fecha VARCHAR(20) NULL;
```

No se incluye este cambio SQL automáticamente porque la Constitución del proyecto indica que las decisiones de base de datos deben coordinarse y documentarse antes de aplicarse.

## Módulos en nevera temporal

Después de los fixes de hoy quedan en nevera temporal:

- Home
- Resumen del Día
- Dashboard Call Center
- Dashboard Operativo

Cualquier cambio futuro sobre esos módulos debe ser mínimo y justificado.
