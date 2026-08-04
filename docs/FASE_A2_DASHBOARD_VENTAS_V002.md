# Dashboard Ventas - Fase A2 V002

## Alcance

Este FIX es acumulativo sobre Fase A1 V001 e incluye:

1. Correccion del selector de responsables comerciales.
2. KPI de proyectos cotizados, vendidos y perdidos.
3. Conteo de cotizaciones y suma de equipos por KPI.
4. Actualizacion selectiva de KPI despues de cambios en cotizaciones.

## Correccion de usuarios

El selector ya no exige `usuarios.area = 'Ventas'`.

Se consideran usuarios activos con alguno de estos roles, ya sea como rol principal o asociado en `usuario_roles`:

- 5 - Director Ventas
- 39 - Asesor Comercial
- 48 - Gerente de Cuentas Corporativas
- 50 - Gerente Comercial Baja California y Sureste
- 54 - Gerente Comercial Zona Norte

Codigos oficiales usados como respaldo:

- DIRECTOR_VENTAS
- ASESOR_COMERCIAL
- GERENTE_CUENTAS_CORPORATIVAS
- GERENTE_COMERCIAL_BC_SURESTE
- GERENTE_COMERCIAL_NORTE

## KPI

Fuente: `ventas_cotizaciones_cor`.

Filtro maestro: `id_asesor = usuario seleccionado`.

Solo se consideran registros activos (`activo = 1`).

- Proyectos cotizados: todas las cotizaciones activas del asesor.
- Proyectos vendidos: cotizaciones con `estatus_proyecto = 'Vendido'`.
- Proyectos perdidos: cotizaciones con `estatus_proyecto = 'Perdido'`.
- Equipos: suma de `numero_equipos` en cada grupo.

## Endpoint agregado

`GET /api/ventas/dashboard/kpis?usuario_id={id}`

## Archivos modificados

- `backend/src/modules/ventas-dashboard/ventas-dashboard.repository.js`
- `backend/src/modules/ventas-dashboard/ventas-dashboard.service.js`
- `backend/src/modules/ventas-dashboard/ventas-dashboard.controller.js`
- `backend/src/modules/ventas-dashboard/ventas-dashboard.routes.js`
- `modules/ventas-dashboard/ventas-dashboard.html`
- `modules/ventas-dashboard/ventas-dashboard.css`
- `modules/ventas-dashboard/ventas-dashboard.js`

No se crean tablas ni scripts SQL.
