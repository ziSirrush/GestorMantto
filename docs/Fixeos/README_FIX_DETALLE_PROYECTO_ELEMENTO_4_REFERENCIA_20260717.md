# Fix Detalle Proyecto - Elemento 4

Fecha: 17/07/2026

## Alcance

Corrección definitiva del encabezado agrupado de Tickets del Proyecto.

## Cambios

1. `backend/src/controllers/data.controller.js`
   - La consulta de tickets del detalle de proyecto ahora relaciona `tickets.codigo_equipo` con `portafolio.numero_equipo`.
   - Devuelve `identificacion_sitio` en cada ticket.
   - Se conserva el filtro del proyecto y del año seleccionado.

2. `core/details.js`
   - El encabezado del acordeón usa primero `ticket.identificacion_sitio` entregado por el backend.
   - Mantiene como respaldo la referencia disponible en la lista de equipos.
   - Todos los grupos pueden permanecer contraídos.
   - Solo un equipo puede estar expandido a la vez.

## Resultado esperado

Equipo: 10139-MEX-ELE-BLT
Referencia en sitio (texto pequeño y gris)                     3 ticket(s)

## Archivos modificados

- `backend/src/controllers/data.controller.js`
- `core/details.js`

## Validaciones realizadas

- `node --check core/details.js`
- `node --check backend/src/controllers/data.controller.js`

No se modificaron los elementos 1, 2 ni 3 del Detalle Proyecto.
