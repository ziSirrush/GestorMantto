# Fix Equipos Críticos - Preferencias por usuario

## Cambios
- El módulo consulta `criticos_fallas` y `criticos_periodo` del usuario autenticado.
- Los valores cargados en los filtros de Equipos Críticos provienen de Aiven; si no están disponibles, usa 3 fallas y 35 días.
- El botón `Aplicar y guardar` persiste ambos valores mediante `PATCH /api/usuarios/me/criticos-preferencias`.
- Al guardar, se actualiza también el usuario almacenado en la sesión local y se emite el evento `mantto:criticos-preferencias-updated`.
- `Limpiar filtros` conserva el criterio personal guardado y limpia únicamente Zona, Proyecto y Buscar.
- Los endpoints del módulo se consultan con el token de autenticación.
- Se mantuvieron sin cambios los criterios independientes de Proyectos Críticos, la tabla U365, el MTBC y los PDF.

## Archivos modificados
- `modules/equipos-criticos/equipos-criticos.js`
- `modules/equipos-criticos/equipos-criticos.html`

## Validaciones
- Sintaxis JavaScript validada con `node --check`.
- Contrato revisado contra los endpoints backend desplegados:
  - `GET /api/usuarios/me/criticos-preferencias`
  - `PATCH /api/usuarios/me/criticos-preferencias`
- Se conservó la estructura modular y no se modificaron otros módulos.
