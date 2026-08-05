# FIX FRONTEND COTIZACIONES EQUIPOS MULTIPLES V001

## Alcance
Plantilla Nueva Cotizacion.

## Cambios
- Se conserva el formato Numero de equipos / Tipo de equipos.
- Se agrega el boton "+ Agregar tipo de equipo".
- Cada fila adicional permite capturar cantidad y tipo.
- Los tipos ya seleccionados se excluyen de las filas restantes.
- Una fila eliminada libera nuevamente su tipo.
- Se limita el numero de filas al catalogo disponible.
- Se calcula y muestra el total de equipos.
- El guardado envia `equipos: [{ tipo_equipo, cantidad, orden }]`.
- Se conservan `numero_equipos` y `tipo_equipos` como resumen compatible.
- El borrador al crear un cliente conserva tambien las filas de equipos.

## Archivos modificados
- index.html
- modules/ventas-cotizaciones-nueva/ventas-cotizaciones-nueva.html
- modules/ventas-cotizaciones-nueva/ventas-cotizaciones-nueva.js
- modules/ventas-cotizaciones-nueva/ventas-cotizaciones-nueva.css

## Validacion
- Sintaxis JavaScript validada con `node --check`.
- Contrato confirmado contra el backend integrado de cotizaciones multiples.
- No incluye cambios de backend ni SQL.
