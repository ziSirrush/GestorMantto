# Fix — Leyendas contextuales de estados visuales

Fecha: 15/07/2026

## Cambios

- Se agregó una leyenda compacta antes de las tablas que muestran emojis de estado.
- Las leyendas se alimentan del catálogo `estados_visuales` mediante `EstadosVisuales_gnral`.
- En escritorio se muestran desplegadas; en móvil aparecen contraídas bajo “Indicadores”.
- Cada elemento conserva tooltip con su significado.
- En Equipos Críticos se excluye `CRITICO` de la leyenda por ser redundante con el contexto.
- No se modificó backend, SQL ni reglas de negocio.

## Archivos modificados

- `core/estados-visuales.js`
- `modules/resumen-dia/resumen-dia.html`
- `modules/callcenter/callcenter.html`
- `modules/dashboard-operativo/dashboard-operativo.html`
- `modules/portafolio/portafolio.html`
- `modules/proyectos/proyectos.html`
- `modules/movimientos-portafolio/movimientos-portafolio.html`
- `modules/equipos-criticos/equipos-criticos.html`
