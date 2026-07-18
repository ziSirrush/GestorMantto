# Fix Movimientos Portafolio v0.5

Cambios aplicados:

- La tabla de movimientos muestra el proyecto visual/formateado en vez del código interno con fecha.
- Se normaliza el formato de proyectos tipo `0197-09-17` o `0197-09-17T...` a `17 de Septiembre #197`.
- El click sobre renglón de equipo usa la misma vista combinada de Equipos Críticos (`openEquipoCritico`) para evitar modales encimados.
- Se conserva el endpoint de movimientos y el cierre mensual automático agregado en v0.4.

Archivos modificados:

- `pruebas/modules/movimientos-portafolio/movimientos-portafolio.js`
- `backend/src/controllers/data.controller.js`
- `docs/README_FIX_MOVIMIENTOS_PORTAFOLIO_V0_5.md`
