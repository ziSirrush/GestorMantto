# Dashboard Operativo - Cambios Dirección V001

## Cambios realizados

- Se retiró de la vista la tabla `Equipos — confirmación de servicio preventivo`.
- Se retiró de la vista la tabla `Histórico de servicios preventivos`.
- Se conservaron internamente las funciones de confirmación e histórico para retomarlas en una integración posterior.
- Los KPI quedaron definidos como:
  - Total de equipos.
  - Con servicio.
  - Pendientes.
  - Total tickets.
  - Validados.
  - Pendientes de validar.
- `Pendientes` se calcula como `Total de equipos - Con servicio`.
- `Pendientes de validar` se calcula como `Total tickets - Validados`.
- Se conservaron filtros, gráficas, consultas, detalles flotantes y navegación global.
- Los KPI de tickets permiten consultar el total, los validados y los pendientes mediante el detalle flotante existente.
- Se ajustó la cuadrícula responsive: 6 columnas en escritorio, 3 en ancho intermedio y 2 en móvil.

## Archivos modificados

- `index.html`
- `modules/dashboard-operativo/dashboard-operativo.html`
- `modules/dashboard-operativo/dashboard-operativo.css`
- `modules/dashboard-operativo/dashboard-operativo.js`

## Validaciones realizadas

- Sintaxis de JavaScript validada con `node --check`.
- HTML revisado sin identificadores duplicados.
- Balance de llaves CSS validado.
- Confirmado que las dos tablas retiradas ya no existen en el HTML.
- Confirmado que no se modificaron backend, rutas, controladores ni base de datos.
- Versiones de caché actualizadas para pruebas mediante NPX.
