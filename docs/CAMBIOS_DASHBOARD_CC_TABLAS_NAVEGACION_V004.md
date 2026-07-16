# Dashboard Call Center - Navegacion de tablas V004

## Causa encontrada
Las tablas "Equipos con mas llamadas del periodo" y "Proyectos con mas llamadas del periodo" regeneraban sus filas sin volver a enlazar los botones de detalle. La tabla "Tickets del periodo" dependia del momento exacto en que `ManttoDetails` estuviera disponible durante el render.

## Cambio aplicado
- Se agrego delegacion de eventos estable en los tres cuerpos de tabla.
- Los clics se resuelven al momento de la interaccion contra las funciones globales existentes:
  - `ManttoDetails.openProyecto`
  - `ManttoDetails.openEquipo_gnral` / `ManttoDetails.openEquipo`
  - `ManttoDetails.openTicket`
- El listener se registra una sola vez por contenedor mediante `data-cc-detail-nav-bound`.
- No se modificaron datos, filtros, KPIs, tablas U365D, No Funcionando, backend ni estilos.

## Archivos modificados
- `modules/callcenter/callcenter.js`
- `index.html`

## Validaciones
- Sintaxis JavaScript con `node --check`.
- Version de cache actualizada a `cc-v006`.
- Confirmada navegacion para Proyecto, Equipo y Ticket en las tres tablas del periodo.
