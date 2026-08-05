# FIX_RESTAURAR_DASHBOARD_VENTAS_POST_VISOR_V001

## Problema localizado

El `index.html` acumulado después de las fases del Visor de Usuarios conservaba el botón y la ruta `ventas-dashboard`, pero había perdido las tres referencias necesarias para montar el módulo real. Por eso `core/router.js` no encontraba `view-ventas-dashboard` y mostraba la pantalla de destino en construcción.

## Archivo modificado

- `index.html`

## Cambios aplicados

Se restauraron exclusivamente:

1. La hoja de estilos `modules/ventas-dashboard/ventas-dashboard.css`.
2. El contenedor `view-ventas-dashboard`.
3. El script `modules/ventas-dashboard/ventas-dashboard.js`.

## Elementos no modificados

- Fases 1, 2 y 3 del Visor de Usuarios.
- `core/router.js`.
- Backend y rutas API.
- Base de datos.
- Permisos.
- Otros módulos, incluidos los módulos en Nevera.

## Validaciones realizadas

- Las tres referencias del Dashboard Ventas aparecen exactamente una vez.
- El contenedor conserva `data-view="ventas-dashboard"` e `id="view-ventas-dashboard"`, coincidentes con la ruta existente.
- Se conservaron las referencias de `core/user-viewer.js`, `core/viewer-readonly.js` y `core/data-sync.js`.
- La comparación contra el `index.html` de Fase 3 muestra únicamente tres líneas agregadas.
