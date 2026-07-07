# Proyectos V0.1.2 - Fix calculos y detalle

## Archivos modificados

- `backend/src/controllers/data.controller.js`
- `backend/src/routes/data.routes.js`
- `pruebas/modules/proyectos/proyectos.js`

## Correcciones

- Se corrige el calculo de KPIs de Proyectos para que use la lista agregada cuando el backend no envia `summary` con los nombres esperados.
- El backend calcula proyectos, equipos, parados y MTBC 365d desde `portafolio` + `tickets` por `numero_equipo/codigo_equipo`.
- Se mantiene el nombre visual de proyectos tipo `0197-09-17` como `17 de Septiembre #197`, sin cambiar la clave usada para consultar Aiven.
- Se refuerzan rutas de detalle:
  - `/api/proyectos/detalle?proyecto=...`
  - `/api/proyectos/detalle/:proyecto`
  - `/api/proyectos/:proyecto`
- El frontend intenta la ruta de detalle y, si falla, usa la ruta alterna por parametro.

## Validaciones realizadas

- `node -c backend/src/controllers/data.controller.js`
- `node -c backend/src/routes/data.routes.js`
- `node -c pruebas/modules/proyectos/proyectos.js`
