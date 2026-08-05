# Dashboard Ventas - Fase A4 V001

## Alcance

Se agregan las cuatro tablas operativas pendientes del Dashboard Ventas:

1. Proyectos activos de Instalaciones del responsable comercial seleccionado.
2. Proyectos de Logistica cuyo estatus no es Entregado.
3. Pendientes asignados al responsable seleccionado cuyo estatus no es Cerrado.
4. Pendientes creados por el responsable seleccionado cuyo estatus no es Cerrado.

## Fuente de datos

No se crean tablas nuevas. Las consultas son de solo lectura sobre:

- `ins_fl`
- `log_ops`
- `pendientes`
- `pendientes_usuarios`
- `usuarios`

## Selector maestro

Las cuatro tablas obedecen al usuario seleccionado en Dashboard Ventas.

- Instalaciones: `ins_fl.id_asesor`.
- Logistica: relacion por `id_ppns` con `ins_fl.id_proyecto` y respaldo por nombre/iniciales del asesor.
- Tareas asignadas: relacion `RESPONSABLE` por iniciales.
- Tareas creadas: correo del creador.

## Endpoint

`GET /api/ventas/dashboard/operacion?usuario_id={id_usuario}`

## Filtros visuales

- Proyectos activos de Instalaciones se muestran con el filtro `Ventas`.
- Logistica pendiente se muestra con el filtro `Logistica`.
- Las dos tablas de pendientes se muestran con el filtro `Tareas`.

## Refresco

El Dashboard vuelve a consultar sus datos despues de cambios exitosos relacionados con Ventas, Instalaciones, Logistica o Pendientes, sin crear timers nuevos.

## Archivos modificados

- `index.html`
- `backend/src/modules/ventas-dashboard/ventas-dashboard.repository.js`
- `backend/src/modules/ventas-dashboard/ventas-dashboard.service.js`
- `backend/src/modules/ventas-dashboard/ventas-dashboard.controller.js`
- `backend/src/modules/ventas-dashboard/ventas-dashboard.routes.js`
- `modules/ventas-dashboard/ventas-dashboard.js`

## Validaciones realizadas

- Sintaxis JavaScript validada con `node --check`.
- Estructura del proyecto validada mediante `npm run check`.
- No se agregaron tablas ni scripts SQL.
