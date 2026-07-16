# PDF Críticos con datos reales V002

## Cambios
- Se amplió `core/pdf/pdf-engine.js` con reportes de varias secciones y numeración de páginas.
- PDF Equipos exporta todos los equipos que cumplen los filtros activos, no solo la página visible.
- PDF Equipos agrega una sección de desglose por equipo con sus tickets BLT reales del periodo.
- PDF Proyectos exporta todos los proyectos que cumplen los filtros activos.
- Se conserva el estilo de Desarrollo: carta horizontal, encabezados corporativos, tabla roja de resumen y tabla azul de detalle.
- Se conservaron MTBC Año Actual y MTBC U365.
- Se actualizó la versión de caché de scripts en `index.html`.

## Archivos modificados
- `index.html`
- `core/pdf/pdf-engine.js`
- `modules/equipos-criticos/equipos-criticos.js`

## Validaciones
- `node --check core/pdf/pdf-engine.js`: correcto.
- `node --check modules/equipos-criticos/equipos-criticos.js`: correcto.
- `node --check backend/server.js`: correcto.
- `node --check backend/src/controllers/criticos.controller.js`: correcto.
- `node --check backend/src/routes/data.routes.js`: correcto.
- Se confirmó la carga de `pdf-engine.js` antes de `equipos-criticos.js`.
- Se confirmó el uso de las rutas reales `/api/equipos-criticos` y `/api/equipos-criticos/:codigo/tickets`.
- `/api/health` inició y respondió; en el entorno de validación no pudo resolver el host de Aiven (`EAI_AGAIN`), por lo que la conexión real a BD debe comprobarse en el entorno local habitual.

## Alcance
- No se modificó backend.
- No se modificó base de datos.
- No se tocaron otros módulos.
