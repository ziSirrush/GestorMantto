# FIX Frontend Ventas > Asignación a Redes V001

## Objetivo

Agregar una primera propuesta funcional para consultar las asignaciones de Redes desde Aiven y enlazarla al botón existente del Panel Lateral.

## Alcance implementado

- Vista principal responsive.
- Resumen operativo de los registros visibles.
- Filtros por búsqueda, Contacto vía, Estatus, Asignación y Cotización.
- Tabla paginada.
- Consulta de detalle en ventana de lectura.
- Consulta de evidencias históricas directas y referencia de archivos Azure.
- Integración de ruta `ventas-asignacion-redes`.
- Integración con el botón existente `ventas_asignacion_redes` del Panel Lateral.
- Conservación del FIX `FIX_PANEL_LATERAL_PERMISOS_V001` en `core/user-viewer.js`.

## Alcance deliberadamente no implementado

Esta V001 es una propuesta de consulta. No agrega todavía:

- Alta de registros.
- Edición.
- Asignación o reasignación desde frontend.
- Cambio de estatus.
- Vinculación de cotización.
- Carga o reemplazo de imágenes.
- Chat y adjuntos.
- KPI comerciales definitivos.

Estas acciones requieren validación visual y funcional del usuario antes de implementarse.

## Archivos nuevos

- `modules/ventas-asignacion-redes/ventas-asignacion-redes.html`
- `modules/ventas-asignacion-redes/ventas-asignacion-redes.css`
- `modules/ventas-asignacion-redes/ventas-asignacion-redes.js`

## Archivos modificados

- `index.html`
- `core/router.js`
- `core/user-viewer.js`

## Backend consumida

- `GET /api/ventas/redes`
- `GET /api/ventas/redes/:id`
- `GET /api/ventas/redes/catalogos`

## SQL requerido

Ninguno.

## Variables de entorno

Ninguna adicional.

## Validación realizada

- Sintaxis de JavaScript validada con `node --check`.
- Confirmada la existencia del botón lateral y la ruta de permisos.
- Confirmada la carga de HTML, CSS y JavaScript en `index.html`.
- Confirmada la activación de la vista desde `core/router.js`.
- No se realizaron pruebas contra Aiven ni validación visual en navegador.
