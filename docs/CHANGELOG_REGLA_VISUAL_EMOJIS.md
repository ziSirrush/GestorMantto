# Fix — Regla visual de emojis por contexto

Fecha: 15/07/2026

## Cambios

- Resumen del Día:
  - El KPI **En críticos** usa el emoji `CRITICO` (`💥`) del catálogo.
  - En las tablas, el ticket muestra sus alertas propias; el proyecto muestra `💥` cuando el equipo pertenece al conjunto crítico; el equipo no duplica los mismos emojis en esa fila.
- Detalle de Proyecto United:
  - Cada equipo muestra sus estados visuales aplicables.
  - Cada ticket relacionado muestra sus alertas propias (atrapado, filtración, voltaje, SLA, no funcionando, etc.).
- Dashboard Call Center:
  - Los proyectos con equipos críticos muestran `💥`.
  - Los tickets muestran sus alertas propias.
  - El equipo no repite los emojis cuando ya están representados en el proyecto o ticket de la misma fila.
- Equipos Críticos:
  - Se eliminó el emoji `💥` redundante de Proyecto y Equipo, porque el contexto del módulo ya implica criticidad.
- Helper general:
  - Se añadió soporte para excluir códigos visuales por contexto mediante `excludeCodes`.

## Archivos modificados

- `core/estados-visuales.js`
- `core/details.js`
- `modules/resumen-dia/resumen-dia.html`
- `modules/resumen-dia/resumen-dia.js`
- `modules/callcenter/callcenter.js`
- `modules/equipos-criticos/equipos-criticos.js`

## Backend

No se modificó. Se conserva el endpoint vigente de `estados_visuales`.
