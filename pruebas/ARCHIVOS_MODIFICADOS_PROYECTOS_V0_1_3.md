# Proyectos V0.1.3 - Fix detalle proyecto

## Archivos modificados

- backend/src/controllers/data.controller.js
- backend/src/routes/data.routes.js
- pruebas/modules/proyectos/proyectos.js

## Correccion

- El detalle de proyecto ahora puede consultarse por la ruta base ya validada:
  - GET /api/proyectos?detalle=1&proyecto=<clave>
- Se mantiene compatibilidad con:
  - GET /api/proyectos/detalle?proyecto=<clave>
  - GET /api/proyectos/:proyecto
- El frontend intenta primero la ruta base para evitar el 404 reportado al abrir el boton Ver.

## No modificado

- Home
- Resumen del Dia
- Equipos Criticos
- Portafolio
- CSS global
