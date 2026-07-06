# CHANGELOG - Equipos Críticos Pruebas V0.3.1

## Corrección de navegación/carga

- Se corrigió la carga del módulo para evitar vista vacía o mezcla visual con Resumen del Día cuando falla la carga del HTML modular por ruta/cache.
- `equipos-criticos.js` ahora conserva un fallback interno con el HTML del módulo.
- No se modificó `modules/resumen-dia/*`.
- Se mantiene independencia de criterios entre Equipos Críticos y Proyectos Críticos.

## Archivos modificados

- `pruebas/index.html`
- `pruebas/core/router.js`
- `pruebas/modules/equipos-criticos/equipos-criticos.js`
- `pruebas/modules/equipos-criticos/equipos-criticos.html`
- `pruebas/modules/equipos-criticos/equipos-criticos.css`
- `backend/src/controllers/criticos.controller.js`
- `backend/src/routes/data.routes.js`

## Nota

Si el frontend se sirve desde una ruta diferente, el fallback evita que el panel quede en blanco. Aun así, la carpeta `modules/equipos-criticos/` debe copiarse completa para mantener la estructura modular.
