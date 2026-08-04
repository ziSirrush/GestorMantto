# Dashboard Ventas - Fase A1 V001

## Alcance

Esta entrega crea la base funcional de Dashboard Ventas sin crear tablas nuevas.

Incluye:

- Vista independiente `ventas-dashboard` ligada al acceso existente del panel lateral.
- Selector maestro con usuarios activos del area Ventas limitados a Director de Ventas, gerentes y asesores.
- Filtros multiples: Todos, Clientes, Cotizaciones, Prospeccion, Redes, Ventas, Perdido, Logistica y Tareas.
- Persistencia temporal del usuario y filtros seleccionados en `sessionStorage`.
- Evento `mantto:ventas-dashboard-filters` para que A2, A3 y A4 consuman el mismo contexto.
- Endpoint de solo lectura `GET /api/ventas/dashboard/usuarios`.
- Validacion del permiso visual efectivo `VENTAS_DASHBOARD_ACCESO_VISUAL_MODULO.ACCESO_VISUAL`.
- No se agregan KPI ni tablas de resultados en A1.

## Ajustes generales acumulativos incluidos

- En movil, el control superior del Visor de Usuarios se oculta; el acceso desde Panel de Control permanece disponible. En escritorio conserva ambos accesos.
- Se instala una señal global `mantto:data-mutated` despues de respuestas exitosas POST, PUT, PATCH o DELETE. Los modulos pueden escucharla para ejecutar recargas selectivas sin reiniciar timers ni recargar toda la aplicacion.
- Dashboard Ventas escucha esa señal para refrescar su selector cuando cambian recursos de Ventas.
- El indicador principal de API conserva la clase `programmer`, por lo que sigue limitado al rol Programador mediante la logica global existente.
- Los estados visuales `NUEVO` (🆕) y `COMENTARIO_NUEVO` (💬) quedan como regla acumulativa, pero no se renderizan en A1 porque esta fase aun no contiene tablas ni comentarios.

## Archivos nuevos

- `modules/ventas-dashboard/ventas-dashboard.html`
- `modules/ventas-dashboard/ventas-dashboard.css`
- `modules/ventas-dashboard/ventas-dashboard.js`
- `backend/src/modules/ventas-dashboard/ventas-dashboard.repository.js`
- `backend/src/modules/ventas-dashboard/ventas-dashboard.service.js`
- `backend/src/modules/ventas-dashboard/ventas-dashboard.controller.js`
- `backend/src/modules/ventas-dashboard/ventas-dashboard.routes.js`

## Archivos modificados

- `index.html`
- `core/router.js`
- `core/app.js`
- `styles/base.css`
- `backend/src/routes/index.js`

## Sin cambios

- No hay SQL.
- No se crean tablas de Dashboard.
- No se modifica Asignacion a Redes.
- No se agregan KPI, PDFs ni consultas de las diez tablas definidas para las siguientes subfases.
