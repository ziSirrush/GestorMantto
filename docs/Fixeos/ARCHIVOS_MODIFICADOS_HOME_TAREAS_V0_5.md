# ARCHIVOS MODIFICADOS - HOME TAREAS V0.5

Objetivo: programar notificaciones usando la tabla existente `sup_notificaciones`.

## Archivos modificados

- `backend/src/controllers/data.controller.js`
- `backend/src/routes/data.routes.js`
- `pruebas/modules/home/home.js`
- `pruebas/core/app.js`
- `pruebas/core/router.js`

## Cambios aplicados

- Se usa `sup_notificaciones`; no se creó tabla nueva.
- Al crear una tarea colaborativa se genera una notificación por responsable.
- Al editar una tarea colaborativa, solo se notifica a responsables nuevos.
- Las tareas personales no generan notificación de asignación.
- La campanita consulta únicamente notificaciones nuevas/no abiertas (`leido = 0`).
- Home muestra únicamente notificaciones abiertas (`leido = 1`), ordenadas de más reciente a más antigua.
- Al abrir una notificación se actualiza `leido = 1` y `fecha_lectura = NOW()`.
- La vista de notificaciones nuevas abre la tarea asociada cuando la acción es `ABRIR_TAREA`.
- Se conserva la regla de Home: el botón contextual de regreso queda oculto cuando la ruta activa es Home.

## Endpoints usados

- `GET /api/notificaciones?estado=nuevas`
- `GET /api/notificaciones?estado=abiertas`
- `PATCH /api/notificaciones/:id/abrir`

## Tabla usada

- `sup_notificaciones`

