# FIX_PVO_PRODUCCION_MAIN_PREVIEW_RESPONSIVE_V005

## Objetivo
Corregir dos desbordamientos responsive detectados en Logistica > PVO-Produccion:

1. El preview ampliado del PDF se salia horizontalmente en celular.
2. PVO-Produccion.Main podia ampliar el viewport completo por el ancho minimo de la tabla.

## Base verificada
Repositorio: `ziSirrush/GestorMantto`
Branch: `main`
Commit base verificado: `e2d3b8ba72b17335c19ae32e8a4ebf9cfcb0ba6f` (`Version 092426.4`).

Blobs usados como base:
- `modules/logistica-produccion/logistica-produccion.js`: `863603d86d3d4f92b60f58edb0fc05b369d54f4c`
- `modules/logistica-produccion/logistica-produccion.css`: `c2eb60b192f66cd4b8ab037e68d2e2412e785bb4`
- `core/module-loader.js`: `44ab7b89404cc8b9b3a9884e5307b9e6ddf81699`

## Cambios
### Preview PDF
- El modal cambia de `view=FitV` a `view=FitH`.
- La primera hoja se ajusta al ancho disponible.
- El desplazamiento necesario queda vertical dentro del visor PDF.
- El iframe y su contenedor quedan limitados a `max-width:100%`.
- En <=760 px el modal ocupa el viewport disponible sin usar `100vw`, evitando el pequeno desbordamiento lateral provocado por el calculo del viewport.

### PVO-Produccion.Main
- El view, pagina y cards se limitan a `width/max-width:100%` y `min-width:0`.
- La toolbar se apila en movil.
- Los indicadores se apilan en movil.
- La tabla conserva todas sus columnas, pero el scroll horizontal queda exclusivamente dentro de `.lp-table-wrap`.
- La pagina completa ya no debe crecer por el `min-width` de la tabla.

### Cache bust
Las cinco rutas que usan el modulo PVO-Produccion apuntan a:
`20260924-pvo-main-preview-responsive-v005`.

## Archivos modificados
- `modules/logistica-produccion/logistica-produccion.js`
- `modules/logistica-produccion/logistica-produccion.css`
- `core/module-loader.js`

## No cambia
- Backend.
- SQL / Aiven.
- Estructura de tablas.
- Logica de documentos.
- Cobranza COR ni sus cache-bust.
- La correccion responsive V004 del Detalle; se conserva y V005 solo la complementa.

## Validacion ejecutada
- `node --check` JS PVO-Produccion: OK.
- `node --check` module-loader: OK.
- balance de llaves CSS: OK.
- test `logistica_produccion_main_preview_responsive_v005.test.js`: 6/6 OK.
- revision de diff: `module-loader.js` cambia solamente los 5 cache-bust de PVO-Produccion.
- no contiene archivos `.patch`.

## Limite de validacion
No se realizo despliegue remoto ni prueba E2E en un telefono fisico desde este entorno. La correccion fue validada estructuralmente contra el codigo de `main` indicado arriba.
