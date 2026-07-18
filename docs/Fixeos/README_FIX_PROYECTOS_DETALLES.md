# Fix Proyectos - detalle de equipos y tickets

Archivos modificados:

- `core/details.js`
- `modules/proyectos/proyectos.js`
- `modules/proyectos/proyectos.css`

Cambios:

- En el detalle de Proyecto, la tabla de Equipos ahora abre el detalle flotante del equipo al hacer clic en el código.
- En el detalle de Proyecto, la tabla de Tickets ahora abre el detalle flotante del ticket al hacer clic en el folio/ticket.
- En la tabla de Equipos, el campo Ultimo ticket tambien queda clicable cuando existe.
- Se agregó `ManttoDetails.openTicket` como handler general para tickets, reutilizable por otros módulos.
- Se mantiene la regla general: Proyecto, Equipo y Ticket mostrados en tablas de detalle deben abrir su detalle flotante correspondiente.

Alcance:

- No se modificaron consultas ni cálculos del módulo Proyectos.
- No se modificó backend.
- No se tocaron variables de entorno ni configuración de Azure/GitHub Pages.
