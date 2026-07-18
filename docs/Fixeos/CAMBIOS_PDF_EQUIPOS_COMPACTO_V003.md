# PDF Equipos Críticos compacto V003

## Cambios
- Se conservó el formato compacto del PDF de Desarrollo.
- La tabla principal ahora contiene únicamente: Código, Proyecto, Zona, Fallas BLT, Último ticket, MTBC Año Actual y MTBC U365.
- El encabezado resume generación, período, mínimo de fallas y total sin desperdiciar espacio vertical.
- Cada desglose usa: Ticket, Fecha, Asunto, Resp., Estado y Causa de falla.
- El encabezado del desglose incluye Proyecto, Zona, Fallas BLT y ambos MTBC en una sola línea.
- Se mantienen todos los resultados filtrados y el desglose real por equipo.

## Archivos modificados
- `index.html`
- `core/pdf/pdf-engine.js`
- `modules/equipos-criticos/equipos-criticos.js`

## Validaciones
- `node --check core/pdf/pdf-engine.js`
- `node --check modules/equipos-criticos/equipos-criticos.js`
- Verificado el orden de carga del motor PDF antes del módulo.
- No se modificó backend, base de datos ni otros módulos.
