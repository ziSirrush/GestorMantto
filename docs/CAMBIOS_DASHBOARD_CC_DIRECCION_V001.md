# Dashboard Call Center - cambios de Dirección V001

## Cambios realizados

- Redistribución de KPIs en escritorio: 6 de operación, 6 de alertas y 4 de indicadores.
- `Fuera de SLA` se movió al bloque de alertas.
- En tablet, los KPI se adaptan a cuatro columnas según el ancho disponible.
- En móvil, los KPI usan dos columnas y tres grupos plegables:
  - Operación abierto inicialmente.
  - Alertas abierto inicialmente.
  - Indicadores cerrado inicialmente.
- El KPI `No Funcionando` ahora abre/cierra su tabla inmediatamente debajo del bloque de alertas.
- Se eliminó la tabla visual duplicada de `No Funcionando` al final del módulo.
- Los botones U365D ahora muestran una sola tabla dinámica inmediatamente debajo:
  - Por Proyecto.
  - Por Equipo.
- Solo una tabla U365D puede permanecer visible; pulsar nuevamente el botón activo la cierra.
- Se actualizaron versiones de caché en `index.html` y en la carga interna del HTML del módulo.

## Archivos modificados

- `index.html`
- `modules/callcenter/callcenter.html`
- `modules/callcenter/callcenter.css`
- `modules/callcenter/callcenter.js`

## Validaciones realizadas

- Sintaxis JavaScript validada con `node --check`.
- HTML analizado correctamente y sin IDs duplicados.
- Confirmada distribución 6 / 6 / 4 de los KPI.
- Confirmada una sola instancia de cada tabla U365D y No Funcionando.
- Confirmado el orden contextual: KPI/controles y tabla inmediatamente debajo.
- No se modificaron backend, rutas, base de datos, cálculos, consultas ni otros módulos.
