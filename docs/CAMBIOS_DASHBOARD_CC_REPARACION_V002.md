# Dashboard Call Center - Reparacion V002

## Causa localizada
- El fix V001 omitio la regla visual `.cc-link`, por lo que Proyecto, Equipo y Ticket heredaron el formato nativo de boton.
- La navegacion quedo dependiendo del enlace global de eventos despues de mover las tablas a paneles dinamicos.

## Cambios
- Se restauro el formato de enlaces clicables para Proyecto, Equipo y Ticket.
- Se agrego enlace local seguro y unico hacia `ManttoDetails.openProyecto`, `openEquipo` y `openTicket`.
- Se agrego `type="button"` a enlaces generados para evitar acciones de formulario accidentales.
- Se normalizo el estilo de los KPI implementados como botones.
- Se conservaron la distribucion 6-6-4, los grupos responsive, No Funcionando desplegable y U365D dinamico.
- Se actualizo la version de cache del modulo a V004.

## Archivos modificados
- `index.html`
- `modules/callcenter/callcenter.css`
- `modules/callcenter/callcenter.js`

## Validaciones
- Sintaxis JavaScript con `node --check`.
- Un solo enlace de evento por elemento generado.
- Conservacion de IDs de tablas y controles.
- Sin cambios en backend, APIs, consultas o calculos.
