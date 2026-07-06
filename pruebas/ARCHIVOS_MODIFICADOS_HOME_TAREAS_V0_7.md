# ARCHIVOS MODIFICADOS - HOME TAREAS V0.7

Objetivo: corregir flujo de notificaciones y reducir la carga inicial de Home a una sola llamada principal.

## Cambios

### Frontend
- `pruebas/index.html`
  - La campanita deja de usar `data-route="notifications"`.
  - Se agrega contenedor flotante `hdr-notif-popover`.

- `pruebas/modules/home/home.js`
  - La campanita abre un dropdown flotante.
  - Cada notificación del dropdown es un botón a su ruta destino.
  - Al abrir una notificación:
    1. se marca como leída en backend,
    2. se cierra el dropdown,
    3. se recarga Home,
    4. se navega al destino.
  - Home carga con `GET /api/home/bootstrap` en lugar de hacer llamadas separadas a pendientes, notificaciones y actividad.
  - Se agrega botón `Marcar como nuevo` en notificaciones abiertas.
  - Selector de proyectos muestra nombre amigable y guarda código de proyecto.

- `pruebas/styles/home.css`
  - Estilos para dropdown de campanita.
  - Estilos para botón `Marcar como nuevo`.

### Backend
- `backend/src/controllers/data.controller.js`
  - Nuevo endpoint lógico `getHomeBootstrap`.
  - Nueva acción `marcarNotificacionNueva`.
  - Catálogo de proyectos devuelve `proyecto_codigo` y `proyecto_nombre`.

- `backend/src/routes/data.routes.js`
  - `GET /api/home/bootstrap`
  - `PATCH /api/notificaciones/:id/nuevo`

## Notas
- La vista completa `#/notifications` se conserva, pero la campanita ya no navega directo a esa vista.
- Este cambio aplica a Home. No se modificaron módulos congelados para evitar romper su comportamiento.
