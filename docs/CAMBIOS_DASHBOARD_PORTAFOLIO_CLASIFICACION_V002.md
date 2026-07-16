# Dashboard Portafolio - Correccion de clasificacion V002

## Cambio aplicado
- Se corrigio la asignacion invertida entre `En Cobranza` y `Gratuito/Garantia`.
- La correccion se aplico de forma consistente en el detalle de equipos, los KPIs y la distribucion comercial.
- `No en Servicio`, Total Portafolio, Funcionando y Parados no fueron modificados.

## Archivo modificado
- `backend/src/controllers/data.controller.js`

## Validaciones
- Sintaxis JavaScript validada con `node --check`.
- Se verificaron las tres expresiones `CASE` usadas por Dashboard Portafolio.
- No se modificaron rutas, exportaciones del controlador, frontend, SQL ni otros modulos.

## Resultado esperado con los datos reportados
- Total Portafolio: 2,690
- En Cobranza: 1,729
- Gratuito/Garantia: 797
- No en Servicio: 164
- La suma comercial debe coincidir con Total Portafolio.
