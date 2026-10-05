# FASE 3 - PVO-PRODUCCION - COMPARACION DE FECHAS EN DETALLE V001

Fecha: 2026-10-05
Proyecto: Mantto Gestor
Modulo: Logistica -> PVO-Produccion
Base oficial verificada: `main` commit `4d49d6b25c2395b9cec472af9d02fe1c221a591c` (`Version 100526.1`).
Base funcional acumulativa: Fase 1 `FASE_1_PVO_PRODUCCION_CAPTURA_MANUAL_FECHAS_V001` + Fase 2 `FASE_2_PVO_PRODUCCION_SEPARACION_FECHAS_FUENTES_V001`.

## Objetivo

Implementar la comparacion solicitada exclusivamente dentro de Detalle PVO-Produccion, conservando como autoridad las fechas capturadas manualmente en `logistica_produccion` y consultando las fuentes operativas solo para comparar.

Comparaciones:

- `logistica_produccion.fecha_pvo` vs `log_ops.pvo`
- `logistica_produccion.fecha_pvo_fl` vs `ins_fl.fecha_visita`
- `logistica_produccion.fecha_cubos` vs `ins_fl.fecha_posible_recepcion_cubo`

La comparacion NO aparece en Main/Listado ni en Crear nuevo.

## Comportamiento

El endpoint de Detalle calcula la comparacion cada vez que se consulta el registro. Por ello, al actualizar `log_ops` o `ins_fl`, la siguiente carga/actualizacion del Detalle vuelve a evaluar contra los valores vigentes de esas fuentes.

La comparacion no modifica ni reemplaza las fechas capturadas en PVO-Produccion.

Estados posibles:

- `COINCIDE`: fecha capturada y fuente unica son iguales.
- `DIFERENTE`: ambas fechas existen, la fuente es unica y no coinciden.
- `SIN_CAPTURA`: existe fecha en fuente, pero no fecha capturada.
- `SIN_FUENTE`: existe fecha capturada, pero la fuente no tiene una fecha valida.
- `SIN_DATOS`: no existen fechas validas en ninguno de los dos lados.
- `SIN_VINCULO`: no existe vinculo operativo resoluble para comparar.
- `FUENTE_MULTIPLE`: `ins_fl` entrega mas de una fecha distinta; el sistema no elige una silenciosamente.

Cuando la fuente `ins_fl` tiene varias fechas distintas, el Detalle las muestra y marca `Fuente con multiples fechas`; no inventa una fecha canonica.

## Frontend

`modules/logistica-produccion/logistica-produccion.js`

- Agrega `comparisonLabel(key)`.
- El Resumen de Detalle muestra, para PVO / Visita / Cubos:
  - valor capturado en PVO-Produccion;
  - valor(es) vigentes de la fuente;
  - estado de comparacion.
- Main/Listado y Crear nuevo no usan `comparisonLabel()` ni `comparacion_fechas`.

`modules/logistica-produccion/logistica-produccion.css`

- Agrega estilos scoped exclusivamente a `#view-logistica-produccion-detalle`.
- No cambia estilos globales del Gestor.

## Backend

`backend/src/modules/logistica-produccion/logistica-produccion.service.js`

- Agrega `buildDateComparison()` como funcion pura de comparacion.
- `detail()` entrega `comparacion_fechas` junto al registro.
- No cambia la persistencia de Fases 1-2.
- No escribe en `log_ops` ni `ins_fl`.

## Cache bust

Las cinco rutas PVO-Produccion usan:

`20261005-pvo-comparacion-detalle-fase3-v001`

## Archivos funcionales modificados

- `backend/src/modules/logistica-produccion/logistica-produccion.service.js`
- `modules/logistica-produccion/logistica-produccion.js`
- `modules/logistica-produccion/logistica-produccion.css`
- `core/module-loader.js`

## Pruebas modificadas/agregadas

- `tests/logistica_produccion_nuevo_busqueda_calendario_v001.test.js`
- `tests/logistica_produccion_orden_filtros_emojis_v001.test.js`
- `tests/logistica_produccion_captura_manual_fechas_fase2_v001.test.js`
- `tests/logistica_produccion_comparacion_detalle_fase3_v001.test.js` (nuevo)

## Requisitos previos

Aplicar primero Fase 1 y Fase 2. Este ZIP es incremental y contiene solo los archivos modificados por Fase 3, completos y con la estructura del repositorio preservada.

## SQL

No requiere `ALTER`, `CREATE`, `INSERT`, `UPDATE` ni migracion. Se reutiliza la estructura actual.

## Sistemas que NO fueron modificados

- GitHub remoto.
- Aiven MySQL.
- Azure App Service.
- GitHub Pages.
- Netlify.
- Datos productivos.
- Permisos, roles o alcances.
- `catalogo_general` ni `Logistica / Estatus Produccion`.

## Fuera de alcance de Fase 3

- No se sincronizan automaticamente las fechas capturadas con `log_ops` o `ins_fl`.
- No se corrige automaticamente una diferencia.
- No se escribe en las fuentes comparativas.
- No se cambia la captura de Fase 1 ni la separacion de autoridad de Fase 2.
- No se realiza deploy ni prueba E2E productiva.
