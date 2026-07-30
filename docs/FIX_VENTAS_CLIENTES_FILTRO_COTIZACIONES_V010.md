# FIX Ventas Clientes - Filtro de cotizaciones V010

## Problema corregido
La API de Cotizaciones ignoraba los parámetros `cliente` e `id_cliente`, por lo que el detalle de un cliente podía mostrar cotizaciones de otros clientes dentro del alcance visible del usuario.

## Regla aplicada
La tabla y los KPI usan la misma condición:

1. `id_cliente` cuando existe la relación física.
2. Respaldo histórico por `UPPER(TRIM(cliente))` + `UPPER(TRIM(asesor))`.
3. Se conserva adicionalmente el alcance general de Ventas del usuario autenticado.
4. El filtro de año conserva las reglas vigentes del módulo de Cotizaciones.

## Endpoints corregidos
- `GET /api/ventas/cotizaciones`
- `GET /api/ventas/cotizaciones/kpis`

## Publicación
Requiere desplegar nuevamente el backend. No requiere SQL ni cambios de frontend.
