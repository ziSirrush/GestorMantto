# FIX_COTIZACIONES_EDICION_SYNC_FILTROS_FALLBACK_EQUIPOS_V002

Base acumulativa: `FIX_COTIZACIONES_EDICION_SYNC_FILTROS_V001` + fallback de equipos históricos.

## Alcance acumulado

1. Cotizaciones: edición reutilizando la plantilla de Nueva cotización.
2. Core: sincronización reactiva/silenciosa por mutaciones, sin polling periódico ni F5.
3. Cotizaciones: corrección del filtro `estatus_proyecto`.
4. Cotizaciones: fallback de equipos históricos cuando no existen filas en `ventas_cotizaciones_equipos_cor`.

## Regla del fallback de equipos

- Si la API entrega `cotizacion.equipos` con filas estructuradas, esas filas son la fuente prioritaria.
- Si `cotizacion.equipos` está vacío, se usan como fallback `ventas_cotizaciones_cor.numero_equipos` y `ventas_cotizaciones_cor.tipo_equipos`.
- En Detalle, el total y los tipos se muestran desde filas estructuradas cuando existen; si no existen, desde los campos históricos.
- En Edición, si solo existe el dato histórico y el usuario no toca el desglose, el formulario conserva `numero_equipos` y `tipo_equipos` y NO envía `equipos`, por lo que no borra ni inventa un desglose.
- Si el dato histórico corresponde exactamente a un solo tipo válido, se presenta en una fila para facilitar su edición, pero no se migra a la tabla separada hasta que el usuario modifique el desglose y guarde.
- Si el histórico contiene varios tipos o un texto que no puede desglosarse con certeza, se muestra como "Dato histórico sin desglose" y se conserva intacto. No se reparte la cantidad entre tipos de forma automática.

## Archivos incluidos

- `core/data-sync.js`
- `modules/ventas-cotizaciones/ventas-cotizaciones.js`
- `modules/ventas-cotizaciones-nueva/ventas-cotizaciones-nueva.js`
- `modules/ventas-cotizaciones-detalle/ventas-cotizaciones-detalle.js`
- `modules/ventas-cotizaciones-detalle/ventas-cotizaciones-detalle.html`

## Validaciones realizadas

Se ejecutó `node --check` sobre los JavaScript incluidos. No requiere cambios SQL ni backend para este fallback.

## Pruebas funcionales recomendadas

1. Abrir una cotización con filas en `ventas_cotizaciones_equipos_cor`: debe mostrar el desglose nuevo.
2. Abrir una cotización sin filas separadas pero con `numero_equipos`/`tipo_equipos`: debe mostrar esos datos históricos.
3. Editar una cotización histórica sin tocar equipos y guardar: debe conservar los campos históricos y no crear un desglose inventado.
4. Editar el desglose de equipos y guardar: desde ese momento debe persistir la estructura separada real.
