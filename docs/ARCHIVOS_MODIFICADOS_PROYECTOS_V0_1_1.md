# Proyectos V0.1.1 - Fix nombres y detalle

## Archivos modificados

- `pruebas/modules/proyectos/proyectos.js`
- `pruebas/modules/proyectos/proyectos.css`
- `backend/src/controllers/data.controller.js`
- `backend/src/routes/data.routes.js`

## Cambios

- Se agregó formateo de códigos de proyecto con patrón `NNNN-MM-DD` a nombre legible:
  - Ejemplo: `0197-09-17` -> `17 de Septiembre #197`.
  - Ejemplo: `0385-09-15` -> `15 de Septiembre #385`.
- La tabla conserva el código original como referencia secundaria.
- El detalle de proyecto ahora consulta por query string (`/api/proyectos/detalle?proyecto=...`) para evitar errores por caracteres especiales en nombres/códigos.
- El backend acepta el proyecto por `params` o por `query`.
- El frontend muestra errores de backend no JSON con más claridad.

## Alcance

No se tocaron Home, Resumen del Día, Equipos Críticos ni Portafolio.
