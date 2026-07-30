# FIX Ventas Clientes - Nuevo cliente V005

Base acumulativa:

1. Local Ver 1400 hrs
2. Fase 1 Clientes
3. Fase 2 Nuevo cliente
4. Fase 3 Detalle y contactos
5. V004 Nuevo cliente / acceso total

## Cambios cerrados

- La sección Gestion comercial permanece visible para todos los usuarios que pueden crear clientes.
- Acceso total: obtiene todos los usuarios activos con iniciales disponibles.
- Usuario administrativo: obtiene exclusivamente los asesores relacionados mediante `usuarios_rel_admin.id_admin -> id_asesor`.
- Usuario sin relaciones administrativas: solo obtiene sus propias iniciales.
- La backend valida nuevamente la asignacion al guardar; no confia solo en el selector frontend.
- `estatus_cliente` se normaliza a mayusculas en frontend y backend.
- Se elimina Proyecto vendido del alta de cliente.
- `proyecto_vendido` y `visualiza` se fuerzan a NULL en el alta normal.
- La relacion de proyecto vendido se conserva desde Cotizaciones mediante `id_cliente` e `id_equipo_vendido`.
- No se agrega boton Regresar dentro de la vista; la navegacion corresponde a la barra contextual.

## Endpoint agregado

`GET /api/ventas/clientes/asesores-asignables`

Respuesta:

- `mode: ALL`
- `mode: ADMIN_REL`
- `mode: SELF`

## Archivos

- `index.html`
- `modules/ventas-clientes-nuevo/ventas-clientes-nuevo.html`
- `modules/ventas-clientes-nuevo/ventas-clientes-nuevo.css`
- `modules/ventas-clientes-nuevo/ventas-clientes-nuevo.js`
- `backend/src/modules/ventas-clientes/ventas-clientes.routes.js`
- `backend/src/modules/ventas-clientes/ventas-clientes.controller.js`
- `backend/src/modules/ventas-clientes/ventas-clientes.service.js`
- `backend/src/modules/ventas-clientes/ventas-clientes.repository.js`

No requiere SQL.
