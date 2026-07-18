# Fix Detalle Ticket — Chat, validación y notificaciones

## Alcance
- Conserva barras, panel lateral y contenido actual.
- Zona central scrolleable para información del ticket.
- Panel fijo derecho con chat y validación.
- Comentarios persistentes en Aiven.
- Validación por Supervisor/Superintendente responsable; Dirección y Programador con acceso elevado; solo Programador revierte a Pendiente.
- Auditoría de validaciones.
- Notificaciones de comentarios y cambios de validación; no se notifica al autor.
- Las notificaciones abren el Detalle Ticket global.

## Orden de despliegue
1. Ejecutar `backend/sql/20260718_detalle_ticket_chat_validacion.sql` en Aiven.
2. Desplegar backend.
3. Verificar `/api/health` y rutas de tickets.
4. Publicar `core/details.js` y `core/router.js`.

## Archivos modificados
- `core/details.js`
- `core/router.js`
- `backend/src/controllers/data.controller.js`
- `backend/src/routes/data.routes.js`
- `backend/sql/20260718_detalle_ticket_chat_validacion.sql`
