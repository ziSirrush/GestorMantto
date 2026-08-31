# FASE 2 — Call Center · Carga acotada y detalle U365 bajo demanda — V001

## Base
Construida sobre `FASE_1_CIERRE_LLAMADAS_POST_LUMBRE_V001`, que a su vez parte de `Auditoria Lumbre.zip`.

## Objetivo
Reducir las llamadas y el volumen inicial del Dashboard Call Center sin modificar permisos, alcance UNITED, tablas ni la lógica de Críticos/MTBC que se está trabajando por separado.

## Cambios

### 1. El Dashboard ya no descarga el histórico completo de tickets al abrir
`/api/operacion/dashboard-call-center/inicial` ahora acepta:
- `from=YYYY-MM-DD`
- `to=YYYY-MM-DD`

La apertura normal usa el período visible del módulo (por defecto, el mes actual). Al cambiar Desde/Hasta se vuelve a consultar únicamente ese período.

### 2. Se eliminó `SELECT *` de la carga inicial de Call Center
El backend selecciona solo las columnas de `tickets` y `portafolio` que el módulo consume.

Esto reduce transferencia y memoria sin modificar los datos funcionales mostrados.

### 3. U365 deja de descargarse al abrir el Dashboard
Antes, la apertura ejecutaba automáticamente la descarga paginada completa de:
- `/api/callcenter/u365/proyectos`
- `/api/callcenter/u365/equipos`

Ahora cada colección U365 se solicita únicamente cuando el usuario abre su vista correspondiente.

Las colecciones se mantienen en memoria después de cargarse para no repetir llamadas durante la misma sesión del módulo.

### 4. Refresco manual
El botón Refrescar:
- vuelve a consultar el período actual;
- actualiza MTBC/criticidad como ya hacía el módulo;
- invalida las colecciones U365 para que se obtengan nuevamente bajo demanda.

### 5. Alcance y seguridad
No se modificaron:
- `humanInformationGuard_gnral`;
- `buildPortafolioScopeSql_gnral`;
- `buildTicketScopeSql_gnral`;
- permisos de Dashboard Call Center;
- llaves maestras o alcance UNITED;
- tablas o estructura de Aiven.

## Archivos modificados
- `modules/callcenter/callcenter.js`
- `backend/src/modules/dashboard-callcenter/dashboard-callcenter.repository.js`
- `backend/src/modules/dashboard-callcenter/dashboard-callcenter.service.js`
- `index.html` (solo cache-buster de `callcenter.js`)

## Validaciones
- `node --check modules/callcenter/callcenter.js` — OK
- `node --check dashboard-callcenter.repository.js` — OK
- `node --check dashboard-callcenter.service.js` — OK
- `npm run check` del backend — OK

## Deliberadamente NO incluido
Esta fase no modifica `criticos.controller.js` ni las fórmulas/queries de MTBC/Críticos.
Por eso las colecciones MTBC y criticidad que alimentan los KPI visibles del Dashboard conservan su comportamiento actual hasta que termine la optimización del bloque Críticos/MTBC.

La fase sí elimina del arranque las dos colecciones U365 completas y acota el universo principal de tickets al período solicitado.
