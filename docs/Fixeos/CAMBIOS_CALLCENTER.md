# Fix Call Center — Tickets sin responsable por equipo

## Archivos modificados
- `modules/callcenter/callcenter.html`
- `modules/callcenter/callcenter.js`
- `index.html`

## Cambios
- Se mantiene eliminada la columna `Crítico` de la tabla **Equipos con más llamadas del período**.
- Se agregó la columna **Tickets sin responsable**.
- El contador se calcula por equipo y por el período seleccionado.
- La validación usa el campo original `responsabilidad` (`res_raw`) mediante `isSinResponsable()`.
- Se actualizó la versión de caché de `callcenter.js` de `cc-v007` a `cc-v008`.
