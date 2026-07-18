# Fix Call Center - Tickets Contextual Uni

## Archivos modificados

- `modules/callcenter/callcenter.html`
- `modules/callcenter/callcenter.js`
- `index.html`

## Cambios aplicados

1. Se sustituyó la tabla configurable de Tickets del período por la tabla estándar `Tickets_contextual_uni` usada en Resumen del Día.
2. Se dejaron los 18 encabezados estándar:
   - No. Ticket
   - Proyecto
   - Equipo
   - Estado
   - Fecha Reporte
   - Hora Reporte
   - Asunto
   - Estatus inicial
   - Fecha Llegada
   - Hora Llegada
   - T. llegada
   - Fecha Solución
   - Hora Solución
   - Estatus final
   - Causa
   - Acción cierre
   - Responsabilidad
   - Causa de falla
3. Se conservaron:
   - buscador;
   - filtro por estatus;
   - paginación;
   - enlaces contextuales de Ticket, Proyecto y Equipo;
   - emojis e indicadores visuales;
   - leyenda de estados visuales.
4. Las fechas de la tabla se muestran en formato `DD/MM/AAAA`.
5. Se retiró el selector de columnas de esta tabla porque el estándar requiere mostrar todos los encabezados.
6. Se actualizó la versión de caché:
   - `callcenter.html`: `20260716-v004`
   - `callcenter.js`: `cc-v009`

## Validación

- Sintaxis JavaScript validada con `node --check modules/callcenter/callcenter.js`.
- No se modificaron backend ni otros módulos.
