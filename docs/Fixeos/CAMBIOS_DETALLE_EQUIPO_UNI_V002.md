# Detalle Equipo United V002

## Cambios

- El panel Servicios mensuales inicia siempre contraído.
- Los KPI quedaron exclusivamente informativos y ya no filtran la tabla.
- Se corrigió la lectura de `fecha_reporte` cuando MySQL devuelve objetos `Date`.
- Se corrigieron:
  - años disponibles de tickets;
  - filtro por año;
  - tickets del año actual;
  - responsabilidades BLT/Cliente del año actual;
  - series mensuales BLT del año actual y U365.
- La gráfica U365 ahora cubre el intervalo real de 365 días y muestra su rango de fechas.
- Cuando un año no tiene tickets, la tabla informa el último año disponible.
- Se mantiene el clic por renglón hacia Detalle Ticket.

## Archivos modificados

- `index.html`
- `core/details.js`
- `backend/src/controllers/data.controller.js`

## Validaciones

- `node --check` en frontend, controlador, rutas y servidor.
- Arranque real del backend hasta `app.listen()`.
- Inicio correcto de jobs mensual y semanal.
- Consistencia de la ruta existente `/api/portafolio/equipos/:codigo`.
