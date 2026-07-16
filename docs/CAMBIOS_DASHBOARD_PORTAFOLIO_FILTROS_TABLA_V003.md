# Dashboard Portafolio - Filtros de tabla V003

## Cambios

- Los filtros Zona, Tipo, Supervisor, Estado operativo y Buscar se movieron al encabezado de la Tabla Portafolio.
- Los botones Limpiar y Aplicar ahora afectan exclusivamente la tabla.
- Los cambios de select y la búsqueda con Enter recargan únicamente la tabla.
- Los KPI y las gráficas consultan el universo global del portafolio y ya no cambian con los filtros de tabla.
- El botón Actualizar continúa refrescando KPI, gráficas y tabla.
- Se actualizó la versión de caché para pruebas con NPX.

## Archivos modificados

- index.html
- modules/portafolio/portafolio.html
- modules/portafolio/portafolio.css
- modules/portafolio/portafolio.js

## Validaciones

- Sintaxis JavaScript validada con node --check.
- HTML sin identificadores duplicados.
- La llamada /api/portafolio/dashboard se realiza sin parámetros de filtro.
- La llamada /api/portafolio/equipos conserva todos los filtros configurados.
- No se modificó backend, base de datos ni Proyectos United.
