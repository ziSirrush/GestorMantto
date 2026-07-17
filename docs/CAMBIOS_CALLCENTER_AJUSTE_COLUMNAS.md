# Fix Call Center - contención de texto en Tickets Contextual Uni

## Cambios
- Se impide que el contenido de una celda invada columnas vecinas.
- Los textos largos se muestran en una sola línea y terminan visualmente con puntos suspensivos.
- Se fijan anchos por columna para conservar la estructura de Tickets Contextual Uni.
- Los enlaces de Ticket, Proyecto y Equipo también respetan el ancho de su celda.
- Se conserva el desplazamiento horizontal de la tabla completa.
- Se actualiza la versión de caché de `callcenter.css` a `cc-v006`.

## Archivos modificados
- `modules/callcenter/callcenter.css`
- `index.html`
