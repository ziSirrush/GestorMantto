# Fix Resumen del Día - Criticidad por usuario

## Cambios

- Resumen del Día obtiene los equipos críticos desde el backend usando las preferencias del usuario autenticado.
- Los valores predeterminados siguen siendo 3 fallas RESP BLT en 35 días cuando el usuario no tiene otra configuración.
- Se eliminó del módulo el cálculo anual local de criticidad.
- El emoji de criticidad se muestra en el número de equipo y ya no en el nombre del proyecto.
- El KPI `En críticos` usa el mismo conjunto de equipos críticos que devuelve el backend para ese usuario.
- Los proyectos conservan el conteo de equipos críticos, pero no heredan el emoji dentro de Resumen del Día.

## Archivos modificados

- `modules/resumen-dia/resumen-dia.js`

## Validaciones

- Sintaxis validada con `node --check`.
- No se modificaron backend, SQL, MTBC ni otros módulos.
- Se conservaron los emojis propios de tickets y las leyendas existentes.
