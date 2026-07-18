# Fix - Estados visuales concatenados

## Alcance
Se agregó un renderizador general que concatena los estados visuales al identificador principal de Proyecto, Equipo o Ticket.

Ejemplos: `💥 🚨 Nuba`, `💥 12638-CMX-ELE-BLT`, `🚨 💧 TCK-000123`.

## Archivos modificados
- `core/estados-visuales.js`
- `modules/resumen-dia/resumen-dia.js`
- `modules/callcenter/callcenter.js`
- `modules/equipos-criticos/equipos-criticos.js`
- `modules/portafolio/portafolio.js`
- `modules/proyectos/proyectos.js`
- `modules/movimientos-portafolio/movimientos-portafolio.js`
- `modules/dashboard-operativo/dashboard-operativo.js`

## Comportamiento
- Los emojis se obtienen de `estados_visuales` mediante `/api/estados-visuales`.
- Se aceptan múltiples estados y se ordenan por prioridad.
- Si un endpoint entrega `estados_visuales`, se usa esa colección.
- Como respaldo se reconocen crítico, atrapado, filtración, voltaje, no funcionando y fuera de SLA.
- No se agrega una columna independiente; los iconos se concatenan al identificador.
