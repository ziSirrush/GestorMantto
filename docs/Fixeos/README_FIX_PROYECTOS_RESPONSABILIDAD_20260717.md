# Fix Proyectos Mantto - Responsabilidad anual por proyecto

Fecha: 17/07/2026
Estado: Desarrollo / listo para pruebas
Base: ultima ver 1320hrs.zip

## Alcance aprobado

1. En la columna Proyecto se conserva únicamente el nombre/enlace azul y se elimina la segunda línea duplicada con el código o nombre repetido.
2. Se agregan cuatro columnas al listado de proyectos:
   - Llamadas Resp. BLT (Año)
   - Última llamada BLT
   - Llamadas Resp. Cliente (Año)
   - Última llamada Cliente
3. Los conteos consideran tickets cuya fecha de reporte pertenece al año calendario en curso.
4. Las fechas corresponden a la llamada más reciente del año en curso para cada responsabilidad.
5. No se modifican colores, plantilla, filtros, KPIs, navegación ni detalles.

## Implementación

- El backend calcula conteos y fechas por código de equipo y después los agrega por proyecto.
- Responsabilidad se normaliza con `UPPER(TRIM(...))` y se compara contra `BLT` y `CLIENTE`.
- El rango anual usa inicio inclusivo del año actual y comienzo exclusivo del año siguiente.

## Archivos modificados

- backend/src/controllers/data.controller.js
- modules/proyectos/proyectos.html
- modules/proyectos/proyectos.js
- index.html
