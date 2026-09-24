# FIX_PVO_PRODUCCION_DETALLE_RESPONSIVE_V004

## Objetivo
Corregir el desbordamiento horizontal residual en **Logística → PVO-Producción → Detalle**, especialmente en teléfonos, sin modificar la lógica de datos ni el backend.

## Base verificada
- Repositorio: `ziSirrush/GestorMantto`
- Rama: `main`
- Commit base verificado: `84fb3df50ebba929c83faea1875dc4f65ef1ab03` (`Version 092426.3`)
- `modules/logistica-produccion/logistica-produccion.css` blob base: `3a599954070355da26cdd882d203a5d6e3485285`
- `core/module-loader.js` blob base: `68bd0d30ad3ba7f7cfd9a7d7c38013df90a226cb`

La base ya incluye V003 del preview PDF y los cambios responsive actuales de Cobranza COR. Este FIX conserva ambos.

## Cambios
1. Se aplica `box-sizing: border-box` de forma localizada al detalle PVO y al modal de documentos.
2. Se evita que tarjetas, forms, grids, resumen, documentos y controles de carga superen el ancho disponible.
3. `input[type=file]`, selects, inputs, textareas y botones se fuerzan a respetar el ancho del contenedor.
4. En móvil, cabecera y acciones del detalle se apilan en una sola columna.
5. La tabla Resumen deja de conservar anchos mínimos horizontales en móvil y cada field ocupa el ancho disponible.
6. Zona de carga CPVO/GM y tarjetas de documentos quedan en una sola columna sin ancho mínimo residual.
7. El modal PDF usa `border-box`; hasta 760 px queda contenido en el viewport y hasta 480 px pasa a pantalla completa (`100vw × 100dvh`) con soporte de safe areas.
8. Se conserva el visor V003: hoja 1 inicial, scroll/touch dentro del PDF y botones Abrir/Descargar.
9. Cache-bust CSS PVO actualizado a `20260924-pvo-detalle-responsive-v004`. El JS PVO se conserva en V003 porque no fue necesario modificarlo.

## Archivos modificados
- `modules/logistica-produccion/logistica-produccion.css`
- `core/module-loader.js`

No hay cambios SQL, Aiven ni backend.

## Instalación
Copiar los archivos del ZIP respetando exactamente la estructura de carpetas y reemplazar los existentes.

## Validaciones realizadas
- Base local reconstruida y comparada con los blob SHA del `main` verificado.
- `node --check core/module-loader.js`: OK.
- `tests/logistica_produccion_detalle_responsive_v004.test.js`: 5/5 OK.
- CSS: llaves balanceadas 291/291.
- `tinycss2`: 0 errores de parseo.
- El diff de `core/module-loader.js` modifica únicamente las 5 referencias CSS compartidas por PVO; conserva la versión JS V003 y los cache-bust actuales de Cobranza COR.

## Alcance de QA
No se ejecutó E2E contra Azure ni un dispositivo físico. La corrección es exclusivamente de layout/CSS y cache-bust.
