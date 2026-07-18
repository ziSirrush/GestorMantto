# Detalle Proyecto United V002

## Cambios

- Se conservó el bloque **Detalle del Proyecto** aprobado.
- La tabla **Equipos del Proyecto** ahora muestra:
  - Equipo.
  - Referencia.
  - Operativo.
  - Fallas BLT del año actual.
  - Última responsabilidad BLT.
  - Responsabilidades Cliente del año actual.
  - Última responsabilidad Cliente.
  - MTBC Año Actual.
  - MTBC U365.
- Los indicadores **Total de equipos** y **Parados** continúan filtrando la misma tabla.
- El renglón completo de un equipo abre el detalle global del equipo.
- La tabla **Tickets del Proyecto**:
  - inicia con el año en curso;
  - permite seleccionar otro año disponible;
  - agrupa los tickets por código de equipo;
  - muestra las 16 columnas solicitadas;
  - abre el detalle global del ticket al pulsar cualquier renglón.
- El filtro de año afecta únicamente a la tabla de tickets.

## Backend

- Se amplió la ruta existente `/api/proyectos/detalle/:proyecto`.
- No se crearon rutas nuevas.
- Se agregaron métricas de equipo con reglas MTBC corporativas RESP BLT.
- Se agregó el parámetro opcional `anio_tickets` y el catálogo `ticket_years`.

## Validaciones

- `node --check core/details.js`.
- `node --check backend/src/controllers/data.controller.js`.
- Consistencia de `getProyectoDetalle` con las rutas existentes.
- Arranque del backend hasta `app.listen()`.
- Actualización de versión de caché en `index.html`.
