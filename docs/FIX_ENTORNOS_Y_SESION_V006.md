# FIX Entornos y Sesion V006

## Base

Este FIX es incremental sobre `FIX_RESTAURACION_BACKEND_COMPLETO_DASHBOARD_VENTAS_V005`.

## Correcciones

1. Dashboard Ventas deja de forzar `http://localhost:3001` cuando el navegador esta en localhost.
2. Dashboard Ventas consume la API exclusivamente por medio de `window.ManttoAuth.apiGet`, que usa la URL central configurada en `core/config.js`.
3. Asignacion a Redes deja de construir manualmente la peticion GET y usa el mismo servicio central de sesion.
4. Se conservan sin cambios la logica de acceso total, permisos, rutas backend y tablas.
5. Se actualizaron las versiones de cache en `index.html`.

## Archivos modificados

- `index.html`
- `modules/ventas-dashboard/ventas-dashboard.js`
- `modules/ventas-asignacion-redes/ventas-asignacion-redes.js`

## Validaciones

- `node --check` correcto en ambos archivos JavaScript.
- `npm run check` correcto sobre la base completa V005.
