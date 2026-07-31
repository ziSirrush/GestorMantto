# Fase 2 — Prospección y Mapa Prospección

## Alcance

- Conexión de Prospección y Mapa Prospección con Aiven.
- Paginación backend de 30 registros por defecto.
- Filtros backend por búsqueda, año de visita, estatus, usuario y estado.
- KPIs calculados en backend.
- Catálogos derivados del alcance visible.
- Mapa con registros que tienen latitud y longitud.
- Endpoint de detalle con comentarios y archivos.
- Alcance comercial reutilizando `ventas-visibility.service.js`.
- Plantilla visual oficial del Gestor por encima de la propuesta visual de Desarrollo.

## Endpoints

- `GET /api/ventas/prospeccion`
- `GET /api/ventas/prospeccion/kpis`
- `GET /api/ventas/prospeccion/catalogos`
- `GET /api/ventas/prospeccion/mapa`
- `GET /api/ventas/prospeccion/:id`

Los endpoints de carga histórica de Fase 0.5 se conservan sin cambios.

## Archivos incluidos

### Backend modificados

- `backend/src/modules/ventas-prospeccion/ventas-prospeccion.routes.js`
- `backend/src/modules/ventas-prospeccion/ventas-prospeccion.controller.js`
- `backend/src/modules/ventas-prospeccion/ventas-prospeccion.service.js`
- `backend/src/modules/ventas-prospeccion/ventas-prospeccion.repository.js`

### Frontend modificados

- `modules/ventas-prospeccion/ventas-prospeccion.html`
- `modules/ventas-prospeccion/ventas-prospeccion.css`
- `modules/ventas-prospeccion/ventas-prospeccion.js`
- `modules/ventas-mapa-prospeccion/ventas-mapa-prospeccion.html`
- `modules/ventas-mapa-prospeccion/ventas-mapa-prospeccion.css`
- `modules/ventas-mapa-prospeccion/ventas-mapa-prospeccion.js`

## No incluido

- No se incluye el proyecto completo.
- No se modifica la base de datos.
- No se modifica el router frontend ni el panel lateral porque ya fueron integrados en Fase 1.
- No se modifica `backend/src/routes/index.js` porque la ruta de Prospección ya fue integrada en Fase 0.5.
- No se habilita Nueva visita; corresponde a Fase 3.
- No se implementa todavía el detalle global; corresponde a Fase 4.

## Validación

- `node --check` ejecutado en los seis archivos JavaScript modificados.
- `npm run check` ejecutado sobre una copia de la backend vigente con los archivos de esta fase aplicados.
