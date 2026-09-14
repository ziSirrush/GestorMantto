# FASE 3 — Horarios Backend CDMX V001

**Proyecto:** Mantto Gestor  
**Fecha:** 14/09/2026  
**Tipo:** Fix incremental  
**Prerrequisitos:** aplicar primero `FASE_1_HORARIOS_NUCLEO_TEMPORAL_V001` y después `FASE_2_HORARIOS_FRONTEND_CDMX_V001`.

## Objetivo

Cerrar la parte **backend / lógica de negocio** del alcance temporal sin modificar la sincronización de Tickets.

Contrato aplicado:

- Los valores externos de Tickets (`fecha_reporte`, llegada, solución, cierre y demás) **no se convierten ni reescriben**; únicamente se comparan contra límites de negocio calculados para Ciudad de México cuando una métrica necesita “hoy”, año actual, U365 o periodo móvil.
- `hoy`, año actual, mes actual, U365, periodos críticos y días transcurridos del Gestor usan como referencia canónica `America/Mexico_City`.
- Los cortes semanales continúan usando `America/Mexico_City` explícitamente.
- Los timestamps absolutos/técnicos (`NOW()`, `CURRENT_TIMESTAMP`, `Date.now()`) que representan sesión, expiraciones, `updated_at`, storage, auditoría técnica o intervalos móviles absolutos **no se convierten en fechas civiles**.
- La Fase 3 no cambia filtros, comparaciones ni escrituras del proceso de sincronización de Tickets.

## Diseño de la solución

### 1. Reloj SQL de negocio independiente de la sesión Aiven

`backend/src/utils/temporal.js` amplía el núcleo temporal con:

- `mexicoCityUtcOffsetMinutes()`
- `sqlMexicoCityNow()`
- `sqlMexicoCityToday()`
- `mexicoCityCivilDateUtc()`

`sqlMexicoCityToday()` genera una expresión SQL dinámica del tipo:

```sql
DATE(DATE_ADD(UTC_TIMESTAMP(3), INTERVAL -360 MINUTE))
```

El offset se obtiene desde la zona IANA `America/Mexico_City` mediante `Intl.DateTimeFormat` en Node. De esta forma:

1. el día se sigue calculando dinámicamente en cada consulta mediante `UTC_TIMESTAMP(3)`;
2. no depende de `@@session.time_zone` de MySQL/Aiven;
3. no requiere que las tablas de zonas horarias de MySQL tengan cargado el nombre `America/Mexico_City`;
4. no se congela una fecha literal al arrancar el backend.

No se cambia globalmente la zona del pool MySQL porque eso podría alterar timestamps absolutos y/o datos externos fuera del alcance.

### 2. Eliminación de `CURDATE()` / `CURRENT_DATE()` como reloj de negocio

Se sustituyen los usos de `CURDATE()` y `CURRENT_DATE()` en lógica de negocio de:

- Equipos Críticos;
- Call Center / Cuartos;
- Proyectos y Detalle Proyecto;
- Portafolio comercial y operativo;
- Atención Prioritaria y Entregas Recientes experimentales;
- notificaciones críticas por Ticket;
- Almacén — días de préstamo;
- Ventas — Prospección;
- Instalaciones — fecha de reglas / reporte.

Después de la fase no quedan usos de `CURDATE()` ni `CURRENT_DATE()` dentro de `backend/src/**/*.js`.

### 3. Año/mes actual en JavaScript backend

Los defaults que dependían de la zona local del servidor dejan de usar `new Date().getFullYear()` o `new Date().getMonth()` para lógica operativa.

Se ajustan:

- selección de año de Tickets en detalle de equipo;
- año/U365 y días transcurridos de Portafolio;
- filtros y años disponibles de Dashboard Ventas;
- filtro anual de Cotizaciones;
- mes por defecto de Dashboard Operativo;
- año usado en generación de contraseña temporal;
- folio diario de Auditoría de Almacén.

### 4. Fechas civiles y U365

En cálculos JavaScript de Portafolio/Detalle, el día civil de CDMX se transforma en un marcador UTC de medianoche **solo para hacer aritmética de calendario sin depender de la zona del servidor**.

Esto no convierte ni reescribe los valores de Ticket.

### 5. Cortes

Se validó que los jobs existentes de:

- Portafolio;
- Logística;
- Almacén;

mantienen `America/Mexico_City` explícito para la determinación del calendario/corte.

## `NOW()` / `CURRENT_TIMESTAMP` revisados y deliberadamente conservados

No todo `NOW()` representa “hoy” civil. Se conservaron los que corresponden a instantes absolutos o técnicos, por ejemplo:

- sesiones y expiraciones;
- `updated_at` / `created_at` técnicos;
- permisos con ventanas de vigencia por instante;
- storage / reintentos / métricas móviles por duración;
- OAuth;
- push/device activity;
- ordenamientos de fallback;
- escrituras de procesos `sync` fuera del alcance.

Cambiar estos valores a una fecha civil CDMX sería incorrecto y mezclaría dos conceptos diferentes: **instante absoluto** vs **día operativo**.

## Frontera estricta de Tickets / Sync

No se modificaron archivos cuyo nombre contenga `sync` o `sincron` entre Fase 2 y Fase 3:

```text
SYNC_NAMED_FILES_CHANGED=0
```

Además, el bloque `syncTickets()` de `backend/src/controllers/data.controller.legacy.js` es byte-a-byte idéntico:

```text
Fase 2 SHA-256: 7b5f05ae6aff24b011ea4be16f9ce1d587dee64b37747e832fca06c39798766e
Fase 3 SHA-256: 7b5f05ae6aff24b011ea4be16f9ce1d587dee64b37747e832fca06c39798766e
```

Por tanto, esta fase no altera:

- carga/sincronización de Tickets;
- filtros del sync;
- comparaciones del sync;
- escrituras operativas del sync;
- normalización de las fechas externas recibidas por ese proceso.

## Archivos productivos modificados

1. `backend/src/controllers/criticos.controller.js`
2. `backend/src/controllers/data.controller.legacy.js`
3. `backend/src/controllers/usuarios.controller.js`
4. `backend/src/modules/almacen/almacen.audit-service.js`
5. `backend/src/modules/almacen/almacen.query-service.js`
6. `backend/src/modules/criticos/callcenter-cuartos-operacion.service.js`
7. `backend/src/modules/criticos/criticos-cuartos-operacion.service.js`
8. `backend/src/modules/criticos/criticos.service.js`
9. `backend/src/modules/dashboard-operativo/dashboard-operativo.controller.js`
10. `backend/src/modules/experimental-atencion-prioritaria/experimental-atencion-prioritaria.service.js`
11. `backend/src/modules/experimental-entregas-recientes/experimental-entregas-recientes.service.js`
12. `backend/src/modules/instalaciones-dashboard/instalaciones-dashboard.repository.js`
13. `backend/src/modules/instalaciones-reporte/instalaciones-reporte.repository.js`
14. `backend/src/modules/portafolio/portafolio-comercial_uni.js`
15. `backend/src/modules/portafolio/portafolio-consultas_uni.js`
16. `backend/src/modules/proyectos/proyectos-cuartos_uni.service.js`
17. `backend/src/modules/proyectos/proyectos.service.js`
18. `backend/src/modules/ventas-cotizaciones/ventas-cotizaciones.service.js`
19. `backend/src/modules/ventas-dashboard/ventas-dashboard.repository.js`
20. `backend/src/modules/ventas-dashboard/ventas-dashboard.service.js`
21. `backend/src/modules/ventas-prospeccion/ventas-prospeccion.repository.js`
22. `backend/src/services/notifications/ticket-critical-notifications_uni.service.js`
23. `backend/src/utils/temporal.js`

## Pruebas nuevas

- `tests/fase3_backend_cdmx_core.test.js`
- `tests/fase3_backend_cdmx_contract.test.js`

Validan, entre otros puntos:

- cruce de medianoche UTC/CDMX;
- año operativo correcto alrededor de Año Nuevo;
- offset de `America/Mexico_City`;
- SQL dinámico sin fecha congelada;
- ausencia de `CURDATE()` / `CURRENT_DATE()` en backend;
- ausencia de `new Date().getFullYear()` como default operativo;
- fecha de reglas de Instalaciones en CDMX;
- mes por defecto de Dashboard Operativo en CDMX;
- jobs de corte con zona explícita;
- ningún archivo `sync` usando el helper de Fase 3;
- bloque `syncTickets()` fuera del cambio.

## Validaciones ejecutadas

### Sintaxis

`node --check` sobre los **23 JS productivos modificados** y los **2 tests nuevos**: **OK**.

### Pruebas específicas Fase 3

```bash
node --test tests/fase3_backend_cdmx_core.test.js tests/fase3_backend_cdmx_contract.test.js
```

Resultado: **10/10 OK**.

### Pruebas temporales acumuladas Fases 1 + 2 + 3

Resultado: **26/26 OK**.

### Validación estructural backend

```bash
cd backend
npm run check
```

Resultado: **OK**.

### Suite oficial existente

```bash
cd backend
npm test
```

Resultado Fase 3: **36/38 OK**.

Se volvió a ejecutar la misma suite sobre la Fase 2 y entrega **36/38 OK** con exactamente los mismos dos fallos:

1. `la campanita muestra la accion y consume la ruta masiva`
2. `cache bust de cierre apunta a los archivos frontend corregidos`

Por tanto, Fase 3 no introduce fallos nuevos en la suite oficial.

### Pruebas adicionales relacionadas

Las pruebas de corte semanal de Portafolio, métricas de equipos y dos smoke tests de Almacén ejecutados durante la revisión pasaron. Tres pruebas legacy adicionales (`fase2_dashboard_runtime` y dos de Auditoría Fase 4) fallan también sin Fase 3, con el mismo resultado en la Fase 2; no son regresiones de esta entrega.

## Base de datos

- ALTER: **NO**
- tablas nuevas: **NO**
- columnas nuevas: **NO**
- migración SQL: **NO**
- escritura realizada en Aiven durante preparación: **NO**

## Instalación

Aplicar en orden:

```text
FASE 1 -> FASE 2 -> FASE 3
```

Copiar el contenido de este ZIP sobre la raíz del repositorio respetando exactamente las rutas y sobrescribiendo únicamente los archivos incluidos.

Después:

```bash
cd backend
npm run check
cd ..
node --test tests/fase1_human_time_core.test.js tests/fase1_human_time_contract.test.js tests/fase2_frontend_cdmx_core.test.js tests/fase2_frontend_cdmx_contract.test.js tests/fase3_backend_cdmx_core.test.js tests/fase3_backend_cdmx_contract.test.js
```

Al promover esta fase se debe reiniciar el backend porque contiene archivos Node.js modificados.

## Estado de despliegue

Este paquete fue preparado y validado estática/localmente.

- GitHub: **NO modificado**
- Aiven: **NO modificado**
- Azure: **NO desplegado**
- GitHub Pages: **NO desplegado**
- Netlify: **NO desplegado**

No se afirma prueba E2E contra Aiven/Azure. La validación actual cubre código, estructura, contratos temporales y pruebas locales.
