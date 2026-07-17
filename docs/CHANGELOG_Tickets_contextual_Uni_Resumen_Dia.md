# CHANGELOG — Tickets_contextual_Uni / Resumen del día

## Alcance
Estandarización puntual de las tablas de tickets del módulo Resumen del día.

## Cambios
- Se conserva la barra de búsqueda y el filtro por estatus existentes.
- No se agregó filtro por año, porque no aplica al contexto diario.
- Se conserva la leyenda contextual definitiva de emojis.
- Se implementó la tabla completa `Tickets_contextual_Uni` con 18 columnas.
- El No. Ticket conserva sus emojis contextuales.
- Proyecto, Equipo y No. Ticket conservan sus accesos a los detalles existentes.
- Las fechas se muestran en formato `DD/MM/AAAA` y las horas en `HH:mm`.
- Se habilita lectura mediante desplazamiento horizontal.
- Las ventanas flotantes derivadas de los KPIs usan la misma estructura contextual completa.

## Backend
No fue necesario modificar backend. La ruta `/api/tickets` ya utiliza `dataController.getTickets` y devuelve `SELECT * FROM tickets`, incluyendo los campos requeridos por la tabla.
