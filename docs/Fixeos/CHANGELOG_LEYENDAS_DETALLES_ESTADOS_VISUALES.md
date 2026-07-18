# Fix de leyendas en tablas de detalle

Fecha: 15/07/2026

## Cambios

- Se conserva la leyenda contextual antes de la tabla de tickets de Resumen del Día.
- Se agrega una leyenda antes de la tabla de equipos del Detalle de Proyecto United.
- Se agrega una leyenda antes de la tabla de tickets del Detalle de Proyecto United.
- Se agrega una leyenda antes de la tabla de tickets del Detalle de Equipo United.
- Las tablas de tickets reutilizan una única función general para evitar duplicación.
- Las leyendas se alimentan desde `estados_visuales`, mantienen tooltips y comportamiento responsive.

## Archivos modificados

- `core/estados-visuales.js`
- `core/details.js`
- `modules/resumen-dia/resumen-dia.html`

## Validación

- `node --check core/estados-visuales.js`
- `node --check core/details.js`
- No se modificó backend ni SQL.
