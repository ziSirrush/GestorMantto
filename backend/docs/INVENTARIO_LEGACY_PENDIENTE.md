# Inventario legacy pendiente después del Entregable 12

## Consumidores autorizados de la fachada

- `src/modules/pendientes/pendientes.repository.js`
- `src/modules/portafolio/portafolio.repository.js`
- `src/modules/tickets/tickets.repository.js`
- `src/modules/notificaciones/notificaciones.routes.js` únicamente para
  `/usuarios` y `/users`

## Dominios completamente independientes del controlador legacy

- Catálogos del agregador `data.routes.js`
- Proyectos
- Dashboard Operativo
- Equipos Críticos
- Home
- Notificaciones (sus tres endpoints propios)
- Health

## Trabajo posterior recomendado

1. Extraer Pendientes a repository/service reales.
2. Extraer Portafolio a repository/service reales.
3. Extraer Tickets a repository/service reales.
4. Mover `/usuarios` y `/users` al dominio Usuarios.
5. Confirmar cero consumidores con `node scripts/validate-architecture.js`.
6. Eliminar la fachada y el archivo legacy solamente después de pruebas de
   integración completas.
