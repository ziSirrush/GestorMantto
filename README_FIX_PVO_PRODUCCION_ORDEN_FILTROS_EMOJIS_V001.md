# FIX PVO-Producción · Orden, filtros e indicadores V001

Fecha: 2026-09-23

## Alcance

FIX localizado para `Logística -> PVO-Producción`.

No crea tablas, no modifica esquema SQL y no cambia la captura/edición de registros.

## Fuente revisada

Se verificó el `main` actual de `ziSirrush/GestorMantto` antes de modificar el módulo:

- `modules/logistica-produccion/logistica-produccion.js` — blob `a733413c70d4e5f45822088fa013f1920184de3a`
- `modules/logistica-produccion/logistica-produccion.css` — blob `f178f8bd49e69c3cc15dc91bc1526b33adfca619`
- `backend/src/modules/logistica-produccion/logistica-produccion.repository.js` — blob `debd589c8e31757db2539b38185663f2e10c4394`
- `core/module-loader.js` remoto — blob `b68954cb81f5cbb2fc5f67513a3e5dcdfb7ba269`

Para `core/module-loader.js`, el paquete preserva el estado del último FIX local entregado para Dashboard Logística (`FIX_DASHBOARD_LOGISTICA_ORDEN_PPNS_FINAL_V001`) para no regresar sus cache-bust aún no confirmados en `main`. Sobre esa copia solo se actualizaron las rutas compartidas de `logistica-produccion`, `logistica-pvo` y `logistica-documentos`.

## Cambios

### 1. Leyenda visible de emojis

Se muestran los significados que ya genera el backend actual:

- `📍` — Falta Archivo PVO.
- `🥨` — Falta PPNS.
- `💾` — Faltan Docs de Producción.
- `✓` — Sin faltantes detectados por esas reglas.

No se inventaron nuevos indicadores.

### 2. Orden inicial

La consulta principal queda ordenada por:

1. `anio_registro` descendente.
2. `semana_registro` descendente.
3. Dentro de la misma semana, Fecha PVO ascendente.
4. Los registros sin una Fecha PVO válida quedan al final de su semana.
5. Como desempate, Proyecto A-Z e `id_produccion` descendente.

### 3. Orden manual en todas las columnas

Cada encabezado de la tabla principal se puede pulsar para alternar ascendente/descendente:

- Docs.
- Proyecto / PPNS.
- Asesor.
- Supervisor.
- Fecha PVO.
- Fecha de Visita.
- Fecha entrega cubos.
- Semana/Año.
- Comentario.
- Estatus Producción.

Las fechas se ordenan cronológicamente; Semana/Año se ordena numéricamente. Los vacíos se conservan al final.

### 4. Filtros por faltantes

El selector `Faltantes` incluye:

- Ver Todos.
- Falta Archivo PVO.
- Falta PPNS.
- Faltan Docs de Producción.
- Sin Fecha PVO.
- Sin Fecha de Visita.
- Sin Fecha entrega cubos.
- Sin Asesor.
- Sin Supervisor.
- Sin Estatus Producción.

Los filtros de fechas consideran faltante cualquier valor que no contenga una fecha `YYYY-MM-DD` válida en la fuente disponible. No se considera `Comentario` como faltante porque el código actual no lo define como dato obligatorio.

La búsqueda existente por Proyecto / PPNS se conserva y puede combinarse con el filtro.

## Archivos modificados

- `modules/logistica-produccion/logistica-produccion.js`
- `modules/logistica-produccion/logistica-produccion.css`
- `backend/src/modules/logistica-produccion/logistica-produccion.repository.js`
- `core/module-loader.js`
- `tests/logistica_produccion_orden_filtros_emojis_v001.test.js`

## Cache-bust

Las rutas compartidas quedan en:

`20260923-pvo-orden-filtros-emojis-v001`

## Validaciones realizadas

- `node --check modules/logistica-produccion/logistica-produccion.js` — OK.
- `node --check backend/src/modules/logistica-produccion/logistica-produccion.repository.js` — OK.
- `node --check core/module-loader.js` — OK.
- `node --test tests/logistica_produccion_orden_filtros_emojis_v001.test.js` — 5/5 OK.
- `(cd backend && npm run check)` — OK.

El test histórico `tests/logistica_produccion_v003.test.js` conserva un fallo preexistente en `row.venta.estado`; se confirmó que falla de la misma forma en la base actual sin este FIX (5/6). No fue modificado porque no pertenece al alcance solicitado.

## No validado

No se ejecutó E2E contra Aiven/Azure productivo ni se realizó despliegue remoto.

## Despliegue

Aplicar los archivos respetando sus rutas. Después reiniciar/republicar el backend y publicar el frontend conforme al flujo normal del proyecto.
