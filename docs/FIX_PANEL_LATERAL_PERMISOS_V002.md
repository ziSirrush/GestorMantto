# FIX Panel lateral permisos V002

## Objetivo
Corregir la identificación de la agrupación de cada módulo en el panel lateral.

## Causa
La función anterior concatenaba `agrupacion_codigo` y `agrupacion_nombre` antes de comparar. Para Ventas, ambos valores producen `ventasventas`, que no coincide exactamente con `ventas`. Esto dejaba sin filas de permiso a todos los módulos agrupados y ocultaba las agrupaciones completas.

## Cambio
Se comparan por separado los valores normalizados de `agrupacion_codigo` y `agrupacion_nombre` contra las claves aceptadas de la agrupación.

## Archivo modificado
- `core/user-viewer.js`

## Alcance
No modifica permisos, rutas, módulos, backend ni base de datos.
