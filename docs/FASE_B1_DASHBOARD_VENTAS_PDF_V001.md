# Dashboard Ventas - Fase B1 PDF V001

## Alcance

Esta fase agrega únicamente permisos, botones y validación técnica del flujo. No genera archivos PDF todavía.

## Comportamiento

- Sin responsable seleccionado: se muestra **Generar PDF general** únicamente cuando el usuario efectivo tiene el permiso general y pertenece al grupo de acceso total de Ventas (roles 1, 5, 7 o 47, con respaldo por nombre oficial).
- Con responsable seleccionado: se muestra **Generar PDF del asesor** únicamente cuando el usuario efectivo tiene el permiso individual.
- En ambos casos se exige primero `VENTAS_DASHBOARD_ACCESO_VISUAL_MODULO.ACCESO_VISUAL`.
- Los endpoints usan `req.contextUser || req.user`, por lo que respetan la identidad efectiva del modo Visor.
- Los botones incluyen estado de validación, indicador de progreso y mensajes de éxito/error.

## Permisos nuevos

- `VENTAS_DASHBOARD_PDF_REPORTES.GENERAR_PDF_GENERAL`
- `VENTAS_DASHBOARD_PDF_REPORTES.GENERAR_PDF_INDIVIDUAL`

El SQL crea únicamente el catálogo. No asigna permisos a roles ni usuarios.

## Endpoints de Fase B1

- `GET /api/ventas/dashboard/pdf/capabilities`
- `GET /api/ventas/dashboard/pdf/prepare?tipo=general`
- `GET /api/ventas/dashboard/pdf/prepare?tipo=individual&usuario_id=<id>`

`prepare` solo valida permisos y parámetros. La generación real se incorporará en B3 y B4.

## Archivos modificados

- `modules/ventas-dashboard/ventas-dashboard.html`
- `modules/ventas-dashboard/ventas-dashboard.js`
- `modules/ventas-dashboard/ventas-dashboard.css`
- `backend/src/middleware/ventas-cotizaciones-permissions.middleware.js`
- `backend/src/modules/ventas-dashboard/ventas-dashboard.routes.js`
- `backend/src/modules/ventas-dashboard/ventas-dashboard.controller.js`
- `backend/src/modules/ventas-dashboard/ventas-dashboard.service.js`

## Archivo nuevo

- `backend/sql/20260805_FASE_B1_DASHBOARD_VENTAS_PDF_PERMISOS.sql`
