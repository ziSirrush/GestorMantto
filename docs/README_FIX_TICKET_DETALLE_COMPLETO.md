# Fix: detalle completo de ticket desde Proyectos

## Problema
El modal global de ticket ya cerraba correctamente, pero al abrir un ticket desde Proyectos usaba el registro parcial incluido en `/api/proyectos/detalle/:proyecto`.

Ese endpoint trae una selección reducida de columnas, por eso en el modal aparecían campos vacíos aunque la información existiera en Aiven.

## Cambio aplicado
- Se agregó endpoint backend: `GET /api/tickets/:ticket`.
- El endpoint consulta `SELECT * FROM tickets WHERE ticket = ? OR folio = ? LIMIT 1`.
- `ManttoDetails.openTicket()` ahora intenta primero cargar el detalle completo por ticket desde backend.
- Si el endpoint no responde, conserva fallback a caché/listado para no romper otros módulos.

## Archivos modificados
- `core/details.js`
- `backend/src/controllers/data.controller.js`
- `backend/src/routes/data.routes.js`

## Alcance
Cambio puntual para Proyectos/detalle global de ticket. No modifica cálculos, KPIs ni tablas base.
