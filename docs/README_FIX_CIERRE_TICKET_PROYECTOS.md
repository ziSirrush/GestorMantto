# Fix cierre/detalle ticket en Proyectos

Alcance puntual:
- `core/details.js`
- `modules/proyectos/proyectos.js`

Cambios:
1. Se evita delegar el click de tickets al modal de Resumen del Dia cuando Proyectos abre un ticket.
2. Se usa el modal global `mg-detail-modal`, que si cuenta con boton de cierre funcional y cierre por click fuera.
3. Se registra una cache temporal de tickets ya cargados en el detalle del proyecto, para no mostrar "Ticket no encontrado" cuando el ticket ya viene en la tabla del proyecto pero no aparece en la carga general de `/api/tickets`.

No se modifican calculos, consultas principales, KPIs ni estructura visual del modulo Proyectos.
