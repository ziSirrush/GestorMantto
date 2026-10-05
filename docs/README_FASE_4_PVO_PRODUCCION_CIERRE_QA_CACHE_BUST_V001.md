# FASE 4 - PVO-PRODUCCION - CIERRE QA Y CACHE BUST V001

Fecha: 2026-10-05  
Proyecto: Mantto Gestor  
Modulo: Logistica -> PVO-Produccion  
Base oficial verificada: `main` commit `4d49d6b25c2395b9cec472af9d02fe1c221a591c` (`Version 100526.1`).  
Base funcional acumulativa requerida: Fase 1 + Fase 2 + Fase 3 de PVO-Produccion.

## Objetivo

Cerrar la implementacion solicitada de PVO-Produccion sin agregar nueva logica de negocio en esta fase. Fase 4 consolida las pruebas, elimina expectativas historicas que ya no corresponden al comportamiento vigente y deja un unico cache bust para las cinco rutas PVO-Produccion.

La logica funcional cerrada por las Fases 1-3 queda validada como conjunto:

- Crear nuevo funciona exclusivamente en modo Manual.
- Fecha PVO, Fecha de Visita, Fecha entrega Cubos, Fecha envio Docs y Fecha envio Pago se capturan con calendario.
- Las cinco fechas se validan y persisten en backend.
- `logistica_produccion.fecha_pvo`, `fecha_pvo_fl` y `fecha_cubos` son la autoridad del modulo.
- `log_ops` e `ins_fl` permanecen como fuentes separadas y no sobrescriben la captura.
- La comparacion contra fuentes se muestra solo en Detalle.
- Estatus Produccion permanece en `catalogo_general`, `area='Logistica'`, `elemento='Estatus Produccion'`.

## Cambio de runtime de Fase 4

Solo se modifica `core/module-loader.js` para unificar las diez referencias CSS/JS de las cinco rutas PVO-Produccion con:

`20261005-pvo-cierre-fase4-v001`

Rutas cubiertas:

- `logistica-produccion`
- `logistica-produccion-nuevo`
- `logistica-produccion-detalle`
- `logistica-pvo`
- `logistica-documentos`

No se modifica en Fase 4 el JavaScript funcional del modulo, el service, repository, rutas, controlador, esquema SQL, permisos ni catalogos.

## Normalizacion de pruebas historicas

Se actualizaron exclusivamente pruebas PVO-Produccion cuyas expectativas estaban obsoletas frente al codigo vigente. No se cambio logica productiva para hacer pasar los tests.

Ajustes principales:

- Cache bust antiguos de PVO se sustituyen por el cache bust final de Fase 4.
- El visor PDF ampliado se valida con `FitH`, que es el comportamiento vigente, en lugar de la expectativa antigua `FitV`.
- La prueba de vista previa valida el texto y accion actuales (`Click en un documento para ampliar la hoja 1` / `Abrir documento`).
- Las pruebas PVO dejan de fijar versiones exactas de assets de Cobranza COR; solo verifican que esos assets sigan presentes. Esto evita acoplar PVO a una version ajena.
- La prueba historica V003 se alinea al contrato actual de snapshots y separacion de fuentes, sin exigir objetos retirados del contrato vigente.
- La validacion de entrega deja de exigir que todo el repositorio historico carezca de `.patch`; Fase 4 valida que el runtime PVO no dependa de patches y el ZIP entregado se verifica por separado sin archivos `.patch`.

## Prueba de cierre nueva

Se agrega:

`tests/logistica_produccion_cierre_fase4_v001.test.js`

Cubre de forma conjunta:

- alta exclusivamente Manual;
- cinco calendarios;
- persistencia de cinco fechas;
- Catalogo General oficial de Estatus Produccion;
- autoridad de las fechas capturadas;
- separacion de `log_ops` / `ins_fl`;
- edicion de las tres fechas operativas solo para registros Manuales;
- comparacion exclusivamente en Detalle;
- cache bust final 10/10.

## Archivos modificados

### Runtime

- `core/module-loader.js`

### Pruebas

- `tests/logistica_produccion_captura_manual_fechas_fase2_v001.test.js`
- `tests/logistica_produccion_cierre_fase4_v001.test.js` (nuevo)
- `tests/logistica_produccion_comparacion_detalle_fase3_v001.test.js`
- `tests/logistica_produccion_detalle_responsive_v004.test.js`
- `tests/logistica_produccion_detalle_resumen_preview_v001.test.js`
- `tests/logistica_produccion_documentos_modal_responsive_v002.test.js`
- `tests/logistica_produccion_documentos_modal_responsive_v003.test.js`
- `tests/logistica_produccion_main_preview_responsive_v005.test.js`
- `tests/logistica_produccion_nuevo_busqueda_calendario_v001.test.js`
- `tests/logistica_produccion_orden_filtros_emojis_v001.test.js`
- `tests/logistica_produccion_v003.test.js`

## Orden de aplicacion

Esta entrega es incremental. Aplicar en orden:

1. Fase 1 - Captura Manual de Fechas.
2. Fase 2 - Separacion de Fechas y Fuentes.
3. Fase 3 - Comparacion en Detalle.
4. Fase 4 - Cierre QA y Cache Bust.

Los archivos del ZIP son completos y conservan la estructura del repositorio. No usar fragmentos ni un `.patch` como entrega principal.

## SQL

No requiere `ALTER`, `CREATE`, `INSERT`, `UPDATE`, migracion ni backfill.

## Validacion ejecutada

- `node --check` sobre `core/module-loader.js` y todos los tests modificados: PASS.
- `node --test tests/logistica_produccion*.test.js`: 54/54 PASS.
- `backend/npm run check`: PASS.
- `backend/npm run test --if-present`: 166/166 PASS.
- `git diff --check` equivalente entre Fase 3 y Fase 4: PASS.
- Cache bust final PVO: 10/10 referencias.
- Integridad de estructura del ZIP y ausencia de `.patch` dentro del entregable: validada al empaquetar.

## No ejecutado

- Escrituras en Aiven: NO.
- Prueba contra Aiven real: NO.
- Commit o push a GitHub: NO.
- Deploy Azure: NO.
- Deploy GitHub Pages: NO.
- Deploy Netlify: NO.
- E2E en navegador contra ambiente publicado: NO.

Preparar este ZIP no significa que los cambios esten desplegados.
