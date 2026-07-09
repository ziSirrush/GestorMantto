# Dashboard Operativo V0.1

Fecha: 2026-07-07
Estado: Desarrollo / Pruebas

## Objetivo

Se agrega el módulo independiente `dashboard-operativo` a la estructura modular de `pruebas`.

## Archivos modificados

- `pruebas/index.html`
- `pruebas/core/router.js`

## Archivos nuevos

- `pruebas/modules/dashboard-operativo/dashboard-operativo.html`
- `pruebas/modules/dashboard-operativo/dashboard-operativo.css`
- `pruebas/modules/dashboard-operativo/dashboard-operativo.js`
- `pruebas/docs/README_DASHBOARD_OPERATIVO_V0_1.md`

## Alcance aplicado

- Se registra la vista `view-operativo`.
- Se registra la hoja de estilos del módulo.
- Se registra el script del módulo.
- Se conecta la ruta `operativo` al router.
- Se habilita el acceso desde el panel lateral existente.
- El módulo consulta datos reales desde Aiven mediante endpoints existentes:
  - `/api/portafolio`
  - `/api/tickets`
- Las confirmaciones de servicio preventivo se guardan de forma local temporal con `localStorage` hasta definir la tabla/endpoints definitivos.

## Notas técnicas

- No se modificaron Home, Resumen del Día, Equipos Críticos, Call Center, Portafolio ni Proyectos.
- El módulo queda encapsulado bajo `window.ManttoDashboardOperativo`.
- Prefijo visual y clases CSS: `op-`.
- Estado de confirmaciones temporales: `mantto_operativo_servicio_confirm_v1`.

## Pendiente futuro

Cuando se defina el flujo definitivo de preventivos, mover confirmaciones de `localStorage` a Aiven con tabla propia y auditoría.
