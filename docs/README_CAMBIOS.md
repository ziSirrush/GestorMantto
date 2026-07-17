# Reimplementación frontend Call Center U365D

Archivos modificados:
- `callcenter/callcenter.html`
- `callcenter/callcenter.js`
- `callcenter/callcenter.css`
- `router.js`
- `index.html`

## Cambios
- Los KPI existentes abren subvistas internas de Call Center mediante el router general.
- El historial distingue `dashboard`, `u365-proyectos` y `u365-equipos` mediante `payload.view`.
- Se mantiene un solo botón Back: el general del proyecto.
- Las tablas U365D se precargan junto con el Dashboard y no vuelven a consultar al abrirse.
- Los encabezados ordenan ascendente/descendente y solo una columna queda activa.
- El MTBC mostrado proviene de los endpoints backend U365D, calculados con responsabilidad BLT.
- La distribución original del Dashboard se conserva usando `display: contents` en el contenedor lógico.

## Endpoints requeridos
- `GET /api/callcenter/u365/proyectos`
- `GET /api/callcenter/u365/equipos`
