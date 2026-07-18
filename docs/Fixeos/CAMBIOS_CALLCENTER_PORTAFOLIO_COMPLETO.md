# Fix Dashboard Call Center - carga completa de Portafolio

## Causa confirmada
El endpoint `/api/portafolio/equipos` limita `page_size` a un máximo de 100 registros. El Dashboard Call Center solicitaba `page_size=20000`, pero el backend devolvía únicamente la primera página de 100 equipos.

Por esa razón, los proyectos de la tabla podían tener tickets y MTBC, pero no encontrar sus equipos dentro de la porción parcial del Portafolio. Esto provocaba:

- `Equipos activos = 0`
- `Cantidad de equipos críticos = 0`

## Cambios

### `modules/callcenter/callcenter.js`
- Se agregó carga paginada de `/api/portafolio/equipos` en bloques de 100 hasta completar `pagination.total`.
- Se conserva un fallback a `/api/portafolio` si el endpoint paginado no devuelve registros.
- La comparación de proyectos ahora normaliza mayúsculas y espacios.
- La condición de activo sigue respetando `inactivo` y `estatus_servicio`.

### `index.html`
- Se actualizó la versión de caché de `callcenter.js` de `cc-v006` a `cc-v007` para asegurar que el navegador cargue el fix.

## No modificado
- Base de datos.
- Backend.
- Rutas.
- HTML o CSS interno del módulo.
- Otros módulos.

## Validación
- `node --check modules/callcenter/callcenter.js`
- Confirmada la función `fetchPortafolioPages()`.
- Confirmado el uso de la carga paginada en `loadData()`.
- Confirmado el nuevo identificador de caché `cc-v007`.
