# FASE 2 - PVO-PRODUCCION - SEPARACION DE FECHAS Y FUENTES V001

Fecha: 2026-10-05
Proyecto: Mantto Gestor
Modulo: Logistica -> PVO-Produccion
Base de repositorio verificada: `main` commit `4d49d6b25c2395b9cec472af9d02fe1c221a591c` (`Version 100526.1`).
Base funcional: Fase 1 `FASE_1_PVO_PRODUCCION_CAPTURA_MANUAL_FECHAS_V001`.

## Objetivo

Completar la segunda fase del cambio solicitado para PVO-Produccion:

- Las fechas PVO, Visita y Entrega de Cubos pertenecen al registro de `logistica_produccion`.
- `log_ops.pvo`, `ins_fl.fecha_visita` e `ins_fl.fecha_posible_recepcion_cubo` dejan de sustituir silenciosamente las fechas capturadas.
- Las fuentes operativas siguen consultandose y se exponen por separado para la comparacion que se implementara visualmente en Detalle en Fase 3.
- Los registros MANUAL permiten editar PVO, Visita y Cubos mediante calendario.
- Los registros historicos SEMI_AUTOMATICO no reciben permiso de edicion de esas tres fechas.
- Los filtros y orden del Main usan las fechas propias capturadas en PVO-Produccion.

## Cambios funcionales

### Backend service

`backend/src/modules/logistica-produccion/logistica-produccion.service.js`

- `decorate()` usa como datos principales:
  - `logistica_produccion.fecha_pvo`
  - `logistica_produccion.fecha_pvo_fl`
  - `logistica_produccion.fecha_cubos`
- Mantiene separadas las fuentes actuales:
  - `fecha_pvo_fuente` <- `log_ops.pvo`
  - `fecha_visita_fuente` <- `ins_fl.fecha_visita`
  - `fecha_cubos_fuente` <- `ins_fl.fecha_posible_recepcion_cubo`
- `detail()` entrega la fuente logistica/instalaciones separada de `produccion`.
- `projectSummary()` entrega las fechas capturadas por PVO-Produccion.
- `update()` admite `fecha_pvo`, `fecha_pvo_fl` y `fecha_cubos` solo para registros MANUAL.
- Las tres fechas editables pasan por `optionalDate()`.

### Backend repository

`backend/src/modules/logistica-produccion/logistica-produccion.repository.js`

- El filtro `sin_pvo` usa `p.fecha_pvo`.
- El filtro `sin_visita` usa `p.fecha_pvo_fl`.
- El filtro `sin_cubos` usa `p.fecha_cubos`.
- El orden inicial por PVO usa `p.fecha_pvo`.
- `log_ops` e `ins_fl` siguen unidos para exponer fuentes comparativas, no para reemplazar la captura.

### Frontend

`modules/logistica-produccion/logistica-produccion.js`

- En Detalle -> Editar de un registro MANUAL se habilitan calendarios para:
  - Fecha PVO
  - Fecha de Visita
  - Fecha entrega cubos
- El payload PATCH solo envia una fecha cuando realmente cambio.
- Seleccionar/cambiar Proyecto no copia fechas desde `log_ops` / `ins_fl` a los campos propios.
- Estatus Logistica continua como dato de solo lectura desde `log_ops.estatus`.
- No se agrega aun la comparacion visual `Coincide / Diferente`; corresponde a Fase 3 y solo se mostrara en Detalle.

### Cache bust

Las cinco rutas PVO-Produccion usan la misma version:

`20261005-pvo-separacion-fechas-fuentes-fase2-v001`

## Archivos modificados

- `modules/logistica-produccion/logistica-produccion.js`
- `backend/src/modules/logistica-produccion/logistica-produccion.service.js`
- `backend/src/modules/logistica-produccion/logistica-produccion.repository.js`
- `core/module-loader.js`
- `tests/logistica_produccion_nuevo_busqueda_calendario_v001.test.js`
- `tests/logistica_produccion_orden_filtros_emojis_v001.test.js`
- `tests/logistica_produccion_captura_manual_fechas_fase2_v001.test.js` (nuevo)

## Sistemas que NO se modifican

- Esquema MySQL / Aiven.
- `catalogo_general` ni sus datos.
- Definicion del catalogo `Logistica / Estatus Produccion`.
- Permisos/roles/alcances.
- GitHub remoto.
- Azure App Service.
- GitHub Pages / Netlify.
- Datos existentes en Produccion.

## SQL

No requiere ALTER, CREATE, INSERT, UPDATE ni migracion. Se reutilizan las columnas existentes de `logistica_produccion`.

## Aplicacion

El ZIP contiene archivos completos y conserva las rutas del repositorio. Copiar/sobrescribir los archivos respetando la estructura y ejecutar las pruebas antes de hacer commit/push.

## Pendiente para Fase 3

Implementar exclusivamente en Detalle la comparacion visual entre:

- `logistica_produccion.fecha_pvo` vs `log_ops.pvo`
- `logistica_produccion.fecha_pvo_fl` vs `ins_fl.fecha_visita`
- `logistica_produccion.fecha_cubos` vs `ins_fl.fecha_posible_recepcion_cubo`

La comparacion no debe aparecer en Main/Listado ni en Crear nuevo.
