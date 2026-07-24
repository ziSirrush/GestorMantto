# FIX V032 - Detalle Equipo

Base: `Ver Publicada 1205hrs - 2407.zip`

## Cambios

1. El PDF `Archivo de equipo` ahora incluye, en el mismo orden visual de Detalle Equipo:
   - titulo Archivo del Equipo;
   - codigo del equipo;
   - proyecto;
   - Detalle del Equipo;
   - todos los KPI de Indicadores del equipo;
   - Responsabilidad de llamadas - Ano actual;
   - Fallas BLT por mes: Ano en curso y Bloque 365 dias;
   - Tickets del Equipo.
2. La seccion `Servicios mensuales` se excluye unicamente del PDF. Permanece sin cambios en la vista.
3. Se agrega el boton `Ir a proyecto` en Detalle del Equipo. Abre el Detalle Proyecto asociado mediante la navegacion existente.
4. Se actualiza la version de cache de `core/details.js` en `index.html`.

## Archivos modificados

- `core/details.js`
- `index.html`

## Base de datos

No requiere cambios SQL.

## Validaciones

- `node --check core/details.js`
- Revision de referencias del boton, exportador PDF y version de cache.
