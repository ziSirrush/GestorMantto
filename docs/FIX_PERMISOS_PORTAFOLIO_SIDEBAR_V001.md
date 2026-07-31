# FIX Permisos Portafolio Sidebar V001

## Problema

La resolución de módulos en `core/user-viewer.js` comparaba las claves de cada botón contra un texto que incluía también el nombre de la agrupación.

Para Portafolio, la clave `portafolio` coincidía con todas las filas del catálogo de esa agrupación. Como resultado, un permiso efectivo de cualquier módulo podía hacer visibles los demás módulos de Portafolio aunque estuvieran desactivados para el usuario.

## Corrección

- La coincidencia se limita a la agrupación real del botón.
- Se compara exclusivamente contra la identidad del módulo:
  - código del módulo;
  - nombre del módulo;
  - ruta frontend.
- Se excluyen de la resolución de módulos las filas internas `__AGRUPACION_VISUAL_*`.
- El endpoint de permisos de sesión ahora incluye `modulo_ruta_frontend` para resolver rutas sin coincidencias parciales.
- Se conserva el soporte para módulos vacíos mediante sus permisos visuales reales.

## Archivos modificados

- `core/user-viewer.js`
- `backend/src/controllers/panel-control.controller.js`

## Base utilizada

`Ultima ver 1547hrs - 3007.zip`.

El FIX es incremental y puede aplicarse sobre la versión posterior siempre que estos dos archivos no hayan recibido otros cambios después de esa base. Si sí los recibieron, se deben integrar las modificaciones por comparación y no reemplazar a ciegas.

## Validaciones

- `node --check core/user-viewer.js`
- `node --check backend/src/controllers/panel-control.controller.js`
- `npm run check` en backend

## Prueba funcional recomendada

1. Seleccionar un usuario con Portafolio desactivado.
2. Confirmar que la agrupación Portafolio desaparece si no tiene ningún módulo permitido.
3. Activar únicamente Dashboard Portafolio.
4. Confirmar que solo aparece Dashboard Portafolio.
5. Activar únicamente Movimientos Portafolio.
6. Confirmar que solo aparece Movimientos Portafolio.
7. Repetir con Proyectos de Mantenimiento.
