# Detalle Equipo United V001

## Cambios
- Detalle general del equipo con los mismos campos ejecutivos del Detalle Proyecto.
- KPIs organizados en bloques 6-4-4.
- Tendencias de fallas RESP BLT por mes para Año Actual y bloque U365.
- Panel plegable de Servicios mensuales con los últimos 12 meses.
- Confirmación mensual reutilizando la lógica local existente; habilitada para Supervisor o Superintendente asignado y Director con permiso activo.
- Tabla de tickets del equipo con filtro de año, año actual por defecto y navegación al Detalle Ticket.
- Cualquier enlace United que use ManttoDetails.openEquipo continúa abriendo este detalle.

## Archivos modificados
- `index.html`
- `core/details.js`
- `backend/src/controllers/data.controller.js`

## Validaciones
- `node --check core/details.js`
- `node --check backend/src/controllers/data.controller.js`
- `node --check backend/src/routes/data.routes.js`
- `node --check backend/server.js`
- Inicio real del backend hasta `app.listen()`.
- Rutas existentes conservadas; no se agregaron endpoints nuevos.
