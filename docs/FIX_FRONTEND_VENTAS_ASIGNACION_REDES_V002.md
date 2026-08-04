# FIX Frontend Ventas · Asignación a Redes V002

## Alcance

- Retira los KPI de la vista principal.
- Retira las columnas ID, creado por y fecha de actualización.
- Conserva filtros, tabla, paginación y actualización manual.
- Sustituye el detalle flotante por una vista independiente.
- Agrega actualización directa de estatus.
- Agrega tabla de campos del registro.
- Agrega vista previa de Imagen 1 e Imagen 2.
- Agrega interacciones con comentarios y hasta 4 adjuntos, usando Azure mediante la backend existente.
- Agrega relación con cotizaciones activas y navegación al detalle de la cotización.

## Archivos modificados

- `index.html`
- `core/router.js`
- `modules/ventas-asignacion-redes/ventas-asignacion-redes.html`
- `modules/ventas-asignacion-redes/ventas-asignacion-redes.css`
- `modules/ventas-asignacion-redes/ventas-asignacion-redes.js`

## Archivos nuevos

- `modules/ventas-asignacion-redes-detalle/ventas-asignacion-redes-detalle.html`
- `modules/ventas-asignacion-redes-detalle/ventas-asignacion-redes-detalle.css`
- `modules/ventas-asignacion-redes-detalle/ventas-asignacion-redes-detalle.js`

## Backend utilizada

- `GET /api/ventas/redes`
- `GET /api/ventas/redes/:id`
- `GET /api/ventas/redes/catalogos`
- `PATCH /api/ventas/redes/:id/estatus`
- `GET /api/ventas/redes/:id/comentarios`
- `POST /api/ventas/redes/:id/comentarios`
- `GET /api/ventas/redes/cotizaciones-activas`
- `PATCH /api/ventas/redes/:id/cotizacion`
- endpoints de acceso temporal para evidencias y adjuntos.

## Fuera de alcance

No se modificaron backend, SQL, permisos, Panel de Control ni otros módulos.
