# FASE 1 - PVO-Produccion - Captura manual de fechas V001

Fecha: 2026-10-05
Proyecto: Mantto Gestor
Base verificada: `ziSirrush/GestorMantto` / `main`
Commit base: `4d49d6b25c2395b9cec472af9d02fe1c221a591c` (`Version 100526.1`)

## Objetivo

Convertir la captura nueva de PVO-Produccion a captura manual de fechas mediante calendario nativo, sin reactivar el flujo semiautomatico y sin crear estructura nueva de base de datos.

Esta fase cubre el alta segura de las fechas. La separacion completa entre dato capturado y fuente operativa en lecturas/listado corresponde a la Fase 2. La comparacion visual contra `log_ops` / `ins_fl` corresponde a la Fase 3 y debe mostrarse solo en Detalle.

## Cambio funcional

En `Agregar PVO-Produccion` se capturan mediante `input type="date"`:

- Fecha PVO -> `fecha_pvo`
- Fecha de Visita -> `fecha_pvo_fl`
- Fecha entrega cubos -> `fecha_cubos`
- Fecha envio Docs a Fabrica -> `fecha_envio_docs_fabrica`
- Fecha envio Pago a Fabrica -> `fecha_envio_pago_fabrica`

El proyecto sigue seleccionandose desde Logistica. El Estatus Logistica continua como dato de solo lectura de `log_ops.estatus`.

El Estatus Produccion NO cambia de fuente. Continua leyendo `catalogo_general` con:

- area: `Logistica`
- elemento: `Estatus Produccion`

## Persistencia minima incluida

Para no dejar una fase que capture valores y luego los pierda, el backend de alta valida las tres fechas nuevas con `optionalDate()` y las entrega al repositorio existente. El repositorio ya persiste las columnas `fecha_pvo`, `fecha_pvo_fl` y `fecha_cubos`, por lo que no se requiere SQL ni ALTER TABLE.

Esta fase NO habilita todavia la edicion posterior de esas tres fechas. Esa responsabilidad queda para la siguiente fase.

## Limite deliberado de Fase 1

El contrato de lectura vigente todavia puede priorizar las fuentes `log_ops` / `ins_fl` en listado y detalle cuando existe `id_log_ops`. Fase 1 no modifica esa capa para evitar mezclar captura con comparacion.

Por lo tanto:

- los valores manuales SI quedan guardados al crear;
- Fase 2 hara que el dato capturado sea la autoridad de lectura del registro manual;
- Fase 3 mostrara la comparacion con la fuente exclusivamente en Detalle.

No considerar esta Fase 1 como cierre completo del cambio solicitado.

## Archivos modificados

- `modules/logistica-produccion/logistica-produccion.js`
- `backend/src/modules/logistica-produccion/logistica-produccion.service.js`
- `core/module-loader.js`
- `tests/logistica_produccion_nuevo_busqueda_calendario_v001.test.js`
- `tests/logistica_produccion_orden_filtros_emojis_v001.test.js`

No se modifica CSS, repository, rutas, esquema SQL, permisos, otros modulos ni Catalogo General.

## Cache bust

Las cinco rutas que reutilizan PVO-Produccion usan ahora el tag compartido:

`20261005-pvo-captura-manual-fechas-v001`

Se actualizan las referencias CSS y JS de las cinco rutas para evitar mezcla de recursos en cache. El CSS no cambia de contenido.

## Validaciones realizadas

- Los cinco archivos base fueron obtenidos del commit indicado y sus blobs se verificaron contra GitHub antes de modificar.
- `node --check` en frontend, service y module-loader: PASS.
- Pruebas dirigidas de PVO-Produccion modificadas: 12/12 PASS.
- Prueba runtime aislada de `create()` con repositorio simulado: PASS.
- Fecha invalida rechazada por `optionalDate()`: PASS.
- `git diff --check`: PASS.
- Diff funcional: 5 archivos, 36 inserciones, 20 eliminaciones.

La suite amplia historica de pruebas PVO ya contiene pruebas antiguas de cache/version que fallan tambien sobre el `main` base; no se presentan como regresiones de esta fase.

La suite backend completa no pudo reproducirse de forma fiel desde los artifacts descargados porque el artifact de Pages excluye algunos SQL/styles/documentos que varias pruebas historicas leen directamente. La ejecucion sintetica mostro los mismos 8 fallos de archivos/expectativas tanto en baseline como con esta fase. Esto NO se presenta como `npm test` completo aprobado.

## Aplicacion

Copiar el contenido del ZIP sobre la raiz del repositorio respetando las rutas.

Validar antes de commit:

```powershell
node --check .\modules\logistica-produccion\logistica-produccion.js
node --check .\backend\src\modules\logistica-produccion\logistica-produccion.service.js
node --check .\core\module-loader.js
node --test .\tests\logistica_produccion_nuevo_busqueda_calendario_v001.test.js .\tests\logistica_produccion_orden_filtros_emojis_v001.test.js

git diff --check
git status
git diff
```

Despues ejecutar la suite oficial del backend desde el repositorio completo antes de hacer push:

```powershell
Set-Location .\backend
npm test
```

## Sistemas no modificados

Preparar este FIX no modifica GitHub, Aiven, Azure, Netlify ni la base de datos. No se ejecuto commit, push, deploy, migracion SQL ni prueba E2E contra el entorno desplegado.
