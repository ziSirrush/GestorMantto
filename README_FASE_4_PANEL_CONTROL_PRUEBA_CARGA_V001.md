# FASE 4 - PANEL DE CONTROL / PRUEBA DE CARGA V001

**Fecha:** 28/09/2026  
**Proyecto:** Mantto Gestor  
**Ubicación funcional:** `Panel de Control > Prueba de Carga`  
**Base de integración:** workspace local vigente con Fases 1–3 + correcciones pre-Fase 3 + Auditoría semanal  
**HEAD Git informativo del workspace:** `37780b376465b8906823bc46fed571f3210eff4a` (`Version 092826.1`)  
**Regla de integración:** esta fase fue fusionada sobre el workspace local actual. No se reconstruyó desde `main` ni se reemplazaron archivos compartidos con versiones antiguas.

## Objetivo

Implementar la **detención real del runner k6 y las métricas vivas de ejecución**, cerrando los riesgos acordados antes de Fases 5–6:

- `Detener prueba` debe detener k6 de verdad;
- `FINALIZANDO` debe seguir bloqueando otra prueba;
- el runner debe atender una señal de cancelación;
- los VUs activos de k6 deben mantenerse separados de los requests activos del backend;
- el backend debe poder pedir un aborto automático por condiciones severas;
- si el runner no confirma el cierre, la ejecución debe quedar explícitamente incompleta y liberar el servidor para una nueva prueba;
- sin `handleSummary()` ni reporte final todavía, porque pertenecen a Fase 5.

## 1. Detención real del runner

El flujo implementado es:

```text
EJECUTANDO
    |
    | usuario pulsa DETENER PRUEBA
    v
FINALIZANDO
    |
    | runner-sample / runner-control
    v
command = ABORT
    |
    | runner-stop-ack
    v
exec.test.abort(...)
    |
    | teardown()
    v
runner-finish
    |
    | espera breve de HTTP/SQL/pool en vuelo
    v
ABORTADA_MANUAL
```

Cambiar únicamente el estado del registry ya no cuenta como detención.

Cuando la sesión entra a `FINALIZANDO`, el middleware de carga deja de admitir nuevas solicitudes funcionales marcadas. Las solicitudes que ya habían entrado pueden cerrar su telemetría durante una ventana breve de drenaje.

## 2. Canal de control del runner

Se agregan endpoints efímeros de control:

```text
GET  /api/panel-control/prueba-carga/session/:id/runner-control
POST /api/panel-control/prueba-carga/session/:id/runner-sample
POST /api/panel-control/prueba-carga/session/:id/runner-stop-ack
POST /api/panel-control/prueba-carga/session/:id/runner-abort
POST /api/panel-control/prueba-carga/session/:id/runner-finish
```

Estos endpoints no reciben el JWT del Programador general en cada heartbeat. Se autentican mediante:

```text
X-Mantto-Load-Test-Token
```

El token es el token efímero de 256 bits reclamado una sola vez en Fase 3. El backend conserva solamente su SHA-256 en RAM.

Las rutas administrativas continúan usando `requireAuth` explícitamente:

```text
capabilities
crear sesión
leer sesión
runner-claim
start
stop
delete
```

El cambio de montaje en `panel-control.routes.js` permite que el heartbeat del runner no ejecute las consultas normales de autenticación/roles en cada muestra, sin dejar abiertos los endpoints administrativos.

## 3. FINALIZANDO bloquea una segunda prueba

Los estados considerados activos ahora son:

```text
LISTA
EJECUTANDO
FINALIZANDO
```

Mientras exista cualquiera de ellos, preparar otra prueba responde conflicto.

Una nueva prueba vuelve a estar disponible cuando la anterior alcanza un estado terminal o expira correctamente.

## 4. Timeout de cierre

Si se solicitó aborto pero el runner no confirma el cierre antes de:

```text
LOAD_TEST_FINALIZATION_TIMEOUT_SECONDS
```

la sesión pasa a:

```text
ABORTADA_SIN_CONFIRMACION
completion_integrity = INCOMPLETO
```

Esto evita que una prueba huérfana bloquee indefinidamente las siguientes.

Fase 5 será responsable de reflejar este estado en el reporte final como prueba incompleta, no como ejecución completada.

## 5. Métricas vivas reales del runner

VU 1 del runner envía periódicamente una muestra con datos de `k6/execution`, incluyendo:

```text
vus_active
vus_initialized
iterations_completed
iterations_interrupted
test_run_duration_ms
progress
```

La interfaz separa explícitamente:

```text
VUs objetivo
VUs activos k6
Máx. VUs activos k6
Requests activos backend
RPS backend (ventana reciente configurable, 10 s por defecto)
p95 backend (misma ventana reciente)
```

**No se usa el número de requests HTTP activos como si fueran VUs.**

El p95 mostrado durante Fase 4 proviene de la telemetría Express de la ventana reciente. El p95 definitivo observado por k6 se integra con el resumen final en Fase 5.

## 6. Polling de control

El intervalo se configura con:

```text
LOAD_TEST_RUNNER_CONTROL_POLL_MS=1000
```

VU 1 publica muestras y revisa la orden de control. Durante el `sleep`, ese VU divide la espera en fragmentos pequeños para no dejar el botón Detener sin respuesta durante todo el think-time.

Las solicitudes funcionales del runner tienen timeout de 10 s y las del canal de control, de 5 s. Al rechazar tráfico marcado de una sesión en `FINALIZANDO`, el backend envía `X-Mantto-Load-Test-Stop: 1`; cualquier VU que reciba esa respuesta aborta la prueba. El envío final del resumen admite hasta 10 s.

El canal no crea un VU adicional fuera del grupo configurado.

## 7. Aborto desde k6

Al recibir `ABORT`, el runner:

1. envía `runner-stop-ack`;
2. llama `exec.test.abort(...)`;
3. entra al ciclo de cierre de k6;
4. `teardown()` intenta llamar `runner-finish`.

El runner también puede notificar un aborto propio mediante `runner-abort`, por ejemplo ante:

- redirección HTTP;
- mismatch de instancia backend;
- catálogo/método inválido;
- fallos de red consecutivos.

## 8. Protecciones automáticas del backend

Se agregan límites de protección configurables:

```text
LOAD_TEST_PROTECTION_MIN_REQUESTS=30
LOAD_TEST_PROTECTION_5XX_PERCENT=10
LOAD_TEST_PROTECTION_P95_MS=5000
```

Después del mínimo de requests, si se alcanza uno de los umbrales configurados, el backend solicita cancelación con fuente `AUTOMATIC` y la sesión entra a `FINALIZANDO`.

Estos valores son protecciones operativas; **no son una calificación automática de rendimiento**.

## 9. Ventana de drenaje

Al confirmar el cierre del runner, el backend espera hasta:

```text
LOAD_TEST_DRAIN_TIMEOUT_SECONDS=5
```

para permitir que terminen requests HTTP, consultas SQL y esperas del pool que ya estaban en vuelo.

Después congela el estado terminal correspondiente.

## 10. Estados terminales de Fase 4

Se contemplan:

```text
FINALIZADA
ABORTADA_MANUAL
ABORTADA_AUTOMATICA
ABORTADA_RUNNER
ABORTADA_SIN_CONFIRMACION
```

`FINALIZADA`, `ABORTADA_MANUAL`, `ABORTADA_AUTOMATICA` y `ABORTADA_RUNNER` quedan en:

```text
completion_integrity = PENDIENTE_RESUMEN
```

porque Fase 4 todavía no recibe `handleSummary()`.

`ABORTADA_SIN_CONFIRMACION` queda directamente:

```text
completion_integrity = INCOMPLETO
```

## 11. Interfaz

`Panel de Control > Prueba de Carga` ahora muestra:

- estado `FINALIZANDO`;
- botón real `DETENER PRUEBA` durante `EJECUTANDO` cuando el actor posee permiso para detener;
- actualización periódica de la sesión mientras está activa;
- VUs objetivo y activos por separado;
- `Requests activos backend`;
- `RPS backend`;
- `p95 backend`;
- máximo de VUs activos observado por k6;
- mensajes diferenciados para terminación/aborto.

`Limpiar` permanece bloqueado durante `LISTA`, `EJECUTANDO` y `FINALIZANDO` para no destruir el contexto de una ejecución activa.

## 12. Una sola instancia / proceso

Se mantiene sin cambios la decisión V001:

```text
LOAD_TEST_SINGLE_INSTANCE=true
```

V001 requiere **una sola réplica y un solo proceso backend** durante una prueba.

El process-instance de Fase 3 sigue formando parte del contrato. Fase 4 no agrega Redis, coordinador distribuido ni tablas para intentar coordinar réplicas.

## 13. Escalabilidad

Se mantiene la decisión vigente:

```text
LOAD_TEST_MIN_VUS
LOAD_TEST_VUS_STEP
LOAD_TEST_MAX_VUS
```

**200 VUs es la meta inicial, no un tope fijo.**

El módulo sigue aceptando, por ejemplo, `LOAD_TEST_MAX_VUS=1000` sin cambios de código, siempre respetando el paso configurado.

## 14. Persistencia / SQL

**No requiere SQL.**

No se agregan:

- tablas;
- columnas;
- índices;
- archivos de resultados;
- localStorage/sessionStorage/IndexedDB para resultados;
- historial de pruebas.

Registry, tokens y telemetría continúan en RAM.

## 15. Auditoría preservada

Se conserva la implementación local de Auditoría del Panel de Control.

Deben permanecer, y fueron validados:

- `auditWeek`;
- `auditCompany`;
- `auditModule`;
- `auditType`;
- `auditLayer`;
- tab `Auditoría`;
- rama `renderMain()` de Auditoría antes de `bootLoading/error`;
- bloque protegido desde `const AUDIT_ZONE='America/Mexico_City';` hasta el cierre de `renderChangeAudit(box)`;
- `.pc-change-audit`;
- `core/change-audit.generated.js`;
- `core/build-info.generated.js`;
- `audit/changes/`;
- `tools/generate-change-audit.js`;
- pruebas de Auditoría.

`implementacion/CODIGO_AUDITORIA_A_CONSERVAR_V001.md` se incluye otra vez como **referencia de integración sin modificar**, por instrucción expresa del proyecto.

## 16. Archivos modificados en Fase 4

```text
backend/.env.example
backend/src/modules/panel-control-prueba-carga/CHANGELOG.md
backend/src/modules/panel-control-prueba-carga/README.md
backend/src/modules/panel-control-prueba-carga/panel-control-prueba-carga.constants.js
backend/src/modules/panel-control-prueba-carga/panel-control-prueba-carga.controller.js
backend/src/modules/panel-control-prueba-carga/panel-control-prueba-carga.registry.js
backend/src/modules/panel-control-prueba-carga/panel-control-prueba-carga.routes.js
backend/src/modules/panel-control-prueba-carga/panel-control-prueba-carga.service.js
backend/src/routes/panel-control.routes.js
core/module-loader.js
implementacion/MODULO_PANEL_CONTROL_PRUEBA_CARGA_V001.md
index.html
modules/panel-control/panel-control.js
modules/panel-control-prueba-carga/panel-control-prueba-carga.css
modules/panel-control-prueba-carga/panel-control-prueba-carga.js
scripts/load-test/mantto-gestor-load-test.k6.js
tests/panel-control-prueba-carga-fase3.test.js
```

## 17. Archivos nuevos en Fase 4

```text
tests/panel-control-prueba-carga-fase4.test.js
README_FASE_4_PANEL_CONTROL_PRUEBA_CARGA_V001.md
VALIDACION_FASE_4_PANEL_CONTROL_PRUEBA_CARGA_V001.txt
MANIFEST_FASE_4_PANEL_CONTROL_PRUEBA_CARGA_V001.txt
```

## 18. Cache-bust

Los archivos compartidos solo reciben la renovación necesaria de versión para cargar Fase 4:

- `modules/panel-control/panel-control.js`: versión de assets de Prueba de Carga;
- `core/module-loader.js`: versión del JS de Panel de Control;
- `index.html`: versión de `core/module-loader.js`.

No se sustituye el contenido funcional de Auditoría.

## 19. Validaciones

La entrega se valida con:

```text
node --check (JS modificados/nuevos)
node --test tests/panel-control-prueba-carga-fase2.test.js tests/panel-control-prueba-carga-fase3.test.js tests/panel-control-prueba-carga-fase4.test.js tests/change-audit-generator.test.js
node --test tests/change-audit-generator.test.js
cd backend && npm run check
cd backend && npm test
git diff --check sobre el delta aislado Fase 4
```

Los resultados exactos se encuentran en `VALIDACION_FASE_4_PANEL_CONTROL_PRUEBA_CARGA_V001.txt`.

## 20. No ejecutado por esta entrega

- prueba k6 real contra Producción: **NO ejecutada**;
- prueba E2E con navegador real: **NO ejecutada**;
- despliegue Azure: **NO ejecutado**;
- modificación de Aiven: **NO ejecutada**;
- commit/push GitHub: **NO ejecutado**;
- despliegue GitHub Pages: **NO ejecutado**;
- despliegue Netlify: **NO ejecutado**.

Por tanto, esta entrega acredita validación estática/unitaria y regresión local, **no una prueba real de carga en Producción**.

## 21. Pendiente explícito para Fase 5

Fase 4 no implementa todavía:

```text
handleSummary()
runner-summary de una sola recepción
p95 final visto por k6
latencias finales k6
reporte COMPLETA / INCOMPLETA
Copiar reporte final
clasificación de pérdida de runner en el reporte
```

Esos puntos deben construirse encima de esta Fase 4, conservando el cierre real ya implementado.

## 22. Reversión

Revertir únicamente los archivos/deltas de esta Fase 4.

**No** restaurar `panel-control.js`, `core/module-loader.js` o `index.html` desde un commit anterior, porque el workspace contiene Auditoría y otros cambios locales posteriores al HEAD.

No existe rollback de BD porque Fase 4 no modifica esquema ni datos persistidos.
