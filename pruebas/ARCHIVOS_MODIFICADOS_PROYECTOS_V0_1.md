# Archivos modificados/agregados - Proyectos V0.1

Base: `pruebas.zip` vigente con Resumen del Día, Equipos Críticos y Portafolio funcionando.

## Agregados

- `pruebas/modules/proyectos/proyectos.html`
- `pruebas/modules/proyectos/proyectos.css`
- `pruebas/modules/proyectos/proyectos.js`
- `pruebas/ARCHIVOS_MODIFICADOS_PROYECTOS_V0_1.md`

## Modificados

- `pruebas/index.html`
  - Se agregó el stylesheet del módulo Proyectos.
  - Se agregó `view-proyectos`.
  - Se agregó el script del módulo Proyectos.

- `pruebas/core/router.js`
  - Se agregó `showProyectos()`.
  - La ruta `proyectos` abre el módulo real en lugar del placeholder.

- `backend/src/controllers/data.controller.js`
  - Se agregaron filtros de Proyectos.
  - Se agregó resumen/listado de Proyectos desde `portafolio` + `tickets`.
  - Se agregó detalle por proyecto.

- `backend/src/routes/data.routes.js`
  - Se agregaron rutas `/api/proyectos/filtros` y `/api/proyectos/:proyecto`.
  - Se conserva `/api/proyectos`.

## No modificados

Validado por comparación binaria contra la base original:

- `pruebas/styles/base.css`
- `pruebas/styles/home.css`
- `pruebas/modules/home/home.js`
- `pruebas/modules/resumen-dia/resumen-dia.js`
- `pruebas/modules/resumen-dia/resumen-dia.css`
- `pruebas/modules/equipos-criticos/equipos-criticos.js`
- `pruebas/modules/equipos-criticos/equipos-criticos.css`
- `pruebas/modules/portafolio/portafolio.js`
- `pruebas/modules/portafolio/portafolio.css`

## Validaciones ejecutadas

- `node -c backend/src/controllers/data.controller.js`
- `node -c backend/src/routes/data.routes.js`
- `node -c pruebas/modules/proyectos/proyectos.js`
- `node -c pruebas/core/router.js`

No se ejecutó conexión real a Aiven desde este entorno.
