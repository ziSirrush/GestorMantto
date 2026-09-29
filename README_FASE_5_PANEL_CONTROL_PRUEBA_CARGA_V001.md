# FASE 5 - PANEL DE CONTROL / PRUEBA DE CARGA V001

**Fecha:** 28/09/2026
**Proyecto:** Mantto Gestor
**Ubicación funcional:** `Panel de Control > Prueba de Carga`
**Base de integración:** workspace local vigente con Fases 1–4, correcciones pre-Fase 3 y Auditoría semanal
**Regla de integración:** esta fase fue fusionada sobre el workspace local actual. No se reconstruyó desde un commit histórico ni se reemplazaron archivos compartidos con versiones antiguas.

## Objetivo

Implementar el **cierre técnico de cada ejecución y el reporte final efímero**, incorporando el resumen de k6 sin confundir métricas del runner con métricas de Express y sin persistir resultados.

Fase 5 resuelve específicamente:

- recepción del resumen final de k6 mediante `handleSummary()`;
- aceptación del resumen una sola vez por sesión;
- autenticación del resumen con el token efímero del runner;
- cierre `COMPLETO` cuando el resumen válido llega;
- cierre `INCOMPLETO` cuando el resumen no llega dentro del plazo;
- reporte de texto en RAM con separación entre métricas k6 y backend;
- copia del reporte desde la interfaz;
- limpieza completa de sesión/reporte sin historial ni persistencia;
- conservación de `LOAD_TEST_MAX_VUS` como límite configurable, sin hard limit de 200.

## 1. Resumen final del runner

Se agrega el endpoint efímero:

```text
POST /api/panel-control/prueba-carga/session/:id/runner-summary
```

El runner lo invoca desde `handleSummary(data)`.

La llamada utiliza:

```text
X-Mantto-Load-Test-Token
```

El token efímero se entrega al runner central mediante `runner/lease`. El backend conserva únicamente su hash en RAM.

El navegador no recibe este token y el reporte tampoco lo contiene.

## 2. Entrega del token a handleSummary

`setup()` devuelve al contexto interno de k6 solo datos no secretos. `handleSummary(data)` lee el token efímero inyectado en `MANTTO_LOAD_TEST_RUNNER_TOKEN` antes de iniciar k6.

No se coloca el token en:

- argumentos visibles de línea de comandos;
- archivos temporales;
- salida estándar del runner;
- HTML;
- reporte final;
- base de datos.

## 3. Aceptación única

El backend acepta el resumen final **una sola vez**.

Una segunda entrega para la misma sesión responde conflicto y no reemplaza los datos ya aceptados.

El resumen debe corresponder a:

- la misma `session_id`;
- el mismo grupo de VUs configurado;
- un `vus_max` compatible con la sesión;
- conteos HTTP compatibles con el total de requests;
- un token efímero válido.

El backend normaliza y conserva únicamente el subconjunto de campos aprobado para el reporte. No almacena arbitrariamente el objeto completo recibido de k6.

## 4. Resumen durante FINALIZANDO

El resumen es válido aunque la sesión todavía esté en:

```text
FINALIZANDO
```

Esto permite cerrar correctamente una prueba detenida manualmente o abortada automáticamente.

El estado terminal de ejecución se conserva. Por ejemplo:

```text
ABORTADA_MANUAL
completion_integrity = COMPLETO
```

`COMPLETO` significa que el conjunto de cierre recibió su resumen final; no significa que la prueba haya alcanzado una calificación de rendimiento satisfactoria.

## 5. Timeout de resumen

Se agrega:

```text
LOAD_TEST_SUMMARY_TIMEOUT_SECONDS=15
```

Rango aceptado por V001:

```text
5 a 120 segundos
```

Cuando una ejecución termina y queda en:

```text
completion_integrity = PENDIENTE_RESUMEN
```

se abre una ventana para recibir `handleSummary()`.

Si el resumen no llega antes del plazo, la sesión pasa a:

```text
completion_integrity = INCOMPLETO
report_incomplete_reason = RUNNER_SUMMARY_TIMEOUT
```

El reporte se genera con las métricas disponibles y deja como `N/D` las métricas que solo k6 podía confirmar.

No se presentan datos parciales como una prueba completada.

## 6. Runner perdido o sin confirmación

Si Fase 4 ya cerró una ejecución como:

```text
ABORTADA_SIN_CONFIRMACION
```

Fase 5 genera inmediatamente un reporte:

```text
INCOMPLETO
```

La causa se conserva en el reporte.

Si el runner sí confirmó su cierre pero falla únicamente el envío de `handleSummary()`, la sesión espera hasta `LOAD_TEST_SUMMARY_TIMEOUT_SECONDS` y después genera el reporte incompleto.

## 7. Métricas del runner

El resumen final normalizado contempla:

```text
VUs configurados
Máx. VUs observados
Duración
Requests
Requests fallidos
RPS k6
Latencia k6: min / avg / p50 / p90 / p95 / p99 / max
HTTP 2xx / 3xx / 4xx / 5xx
Timeouts
Errores de red
Iteraciones completadas
```

No se usa `dropped_iterations` como si significara `iterationsInterrupted`, porque son conceptos distintos. Si el resumen final de k6 no expone un dato equivalente, el reporte muestra `N/D` en vez de inventarlo.

## 8. Métricas backend

El reporte conserva por separado las métricas recogidas por el backend:

```text
Requests backend
Errores backend
RPS backend
p50 / p95 / p99 backend
Requests simultáneos máximos
Node RSS / Heap / CPU / Event Loop
Host CPU / RAM / load average cuando esté disponible
MySQL Threads_connected / Threads_running / Connections / Slow_queries
Pool SQL
Endpoints lentos
Queries lentas
Protecciones activadas
```

Las métricas k6 y backend no se sustituyen entre sí.

## 9. Reporte de texto

Se agrega:

```text
GET /api/panel-control/prueba-carga/session/:id/report
```

Esta ruta:

- usa autenticación normal del Gestor;
- verifica actor y propiedad de sesión;
- no devuelve secretos;
- devuelve el reporte en memoria de esa sesión.

El reporte contiene, según disponibilidad:

```text
PRUEBA DE CARGA - MANTTO GESTOR
ESTADO E INTEGRIDAD
TRAFICO K6
LATENCIA K6
TRAFICO BACKEND
LATENCIA BACKEND
HTTP
SERVIDOR
MYSQL
ENDPOINTS MAS LENTOS
QUERIES LENTAS
PROTECCION
CIERRE DEL RUNNER
```

La sección `QUERIES LENTAS` incluye solo fingerprints con al menos una consulta que superó el umbral de lentitud configurado. El RPS backend del reporte es el promedio de toda la ejecución; el panel en vivo muestra la ventana reciente.

## 10. Interfaz

`Panel de Control > Prueba de Carga` ahora:

- sigue actualizando mientras la prueba está activa;
- sigue actualizando mientras exista `PENDIENTE_RESUMEN`;
- muestra `COMPLETO`, `INCOMPLETO` o `PENDIENTE_RESUMEN`;
- carga el reporte cuando el backend informa `report_available=true`;
- muestra el reporte en un área de texto de solo lectura;
- ofrece `Copiar reporte`;
- conserva `Limpiar sesión`;
- bloquea la limpieza mientras el resumen final todavía está pendiente.

Copiar utiliza `navigator.clipboard` y mantiene un fallback local de selección/copiar para navegadores compatibles.

## 11. Persistencia

Fase 5 mantiene la regla V001:

```text
NO crear tablas
NO guardar resultados en MySQL
NO escribir reportes en disco
NO usar localStorage/sessionStorage/IndexedDB para resultados
NO crear historial de pruebas
```

La sesión, el resumen normalizado y el reporte existen únicamente en RAM hasta limpieza, TTL o reinicio del proceso.

## 12. Una sola instancia y una sola prueba

Se mantiene:

```text
LOAD_TEST_SINGLE_INSTANCE=true
```

V001 requiere una sola réplica / un solo proceso backend durante la prueba.

También se mantiene una sola sesión activa en estados operativos. Una vez cerrada la prueba y resuelto el resumen como `COMPLETO` o `INCOMPLETO`, puede prepararse una nueva prueba de acuerdo con las reglas de limpieza/TTL existentes.

## 13. VUs

La regla vigente continúa siendo:

```text
VUs % 10 === 0
VUs <= LOAD_TEST_MAX_VUS
```

`200` es únicamente la meta inicial de nuestras pruebas actuales.

Ejemplo:

```text
LOAD_TEST_MAX_VUS=200
210  -> rechazado

LOAD_TEST_MAX_VUS=1000
200  -> válido
500  -> válido
1000 -> válido
1010 -> rechazado
```

No existe un tope fijo de 200 codificado como límite arquitectónico.

## 14. Archivos principales de Fase 5

Nuevos:

```text
backend/src/modules/panel-control-prueba-carga/panel-control-prueba-carga.report.js
tests/panel-control-prueba-carga-fase5.test.js
README_FASE_5_PANEL_CONTROL_PRUEBA_CARGA_V001.md
```

Modificados:

```text
backend/.env.example
backend/src/modules/panel-control-prueba-carga/CHANGELOG.md
backend/src/modules/panel-control-prueba-carga/README.md
backend/src/modules/panel-control-prueba-carga/panel-control-prueba-carga.constants.js
backend/src/modules/panel-control-prueba-carga/panel-control-prueba-carga.controller.js
backend/src/modules/panel-control-prueba-carga/panel-control-prueba-carga.registry.js
backend/src/modules/panel-control-prueba-carga/panel-control-prueba-carga.routes.js
backend/src/modules/panel-control-prueba-carga/panel-control-prueba-carga.service.js
scripts/load-test/mantto-gestor-load-test.k6.js
modules/panel-control-prueba-carga/panel-control-prueba-carga.js
modules/panel-control-prueba-carga/panel-control-prueba-carga.css
modules/panel-control/panel-control.js
core/module-loader.js
index.html
implementacion/MODULO_PANEL_CONTROL_PRUEBA_CARGA_V001.md
tests/panel-control-prueba-carga-fase3.test.js
tests/panel-control-prueba-carga-fase4.test.js
```

Los tests de Fases 3 y 4 se actualizaron únicamente donde todavía esperaban que `handleSummary()` no existiera. Sus controles de seguridad, destino cerrado y detención real siguen siendo exigidos.

## 15. Auditoría preservada

Se verificó que permanecen:

```text
auditWeek
auditCompany
auditModule
auditType
auditLayer
```

La rama protegida de `renderMain()` continúa antes de los retornos por carga/error:

```javascript
if(state.tab==='audit'){
  renderChangeAudit(box);
  updateSaveButton();
  return;
}
```

El bloque desde:

```text
const AUDIT_ZONE='America/Mexico_City';
```

hasta el cierre de `renderChangeAudit(box)` fue comparado contra la base de Fase 4 y quedó **idéntico byte a byte**.

También se conserva `implementacion/CODIGO_AUDITORIA_A_CONSERVAR_V001.md` en el entregable.

## 16. Validaciones ejecutadas

Ejecutadas sobre el workspace integrado de Fase 5:

```text
Fases 2 + 3 + 4 + 5 + Auditoría: 49/49 PASS
backend npm run check: PASS
backend npm test: 76/76 PASS
node --check de archivos JS modificados: PASS
bloque protegido Auditoría: byte-identical PASS
```

El `git diff --check` del delta aislado se documenta también en `VALIDACION_FASE_5_PANEL_CONTROL_PRUEBA_CARGA_V001.txt` dentro del ZIP.

## 17. Prueba k6 real

No se ejecutó una carga real contra un despliegue del Gestor desde este entorno de generación.

Por tanto:

> **No puedo confirmar el comportamiento de una ejecución k6 real ni la capacidad concurrente del servidor hasta ejecutar la prueba controlada en el entorno autorizado.**

La validación realizada aquí cubre código, contratos, estados y pruebas automatizadas; no sustituye la prueba de carga real.

## 18. Fuentes técnicas k6 utilizadas para el diseño

Documentación oficial de Grafana k6:

```text
https://grafana.com/docs/k6/latest/results-output/end-of-test/custom-summary/
```

La documentación oficial establece que `handleSummary()` se ejecuta al final de la prueba y permite producir/enviar salidas personalizadas.

FIX pre Fase 6: k6 documenta `handleSummary(data)` con un solo argumento; el retorno de `setup()` no se entrega a ese hook. El token se inyecta en el entorno del proceso hijo y no aparece en argumentos, archivos ni reportes.

## 19. No realizado por esta entrega

Esta entrega no:

- ejecuta SQL;
- crea tablas;
- persiste resultados;
- modifica datos operativos del Gestor;
- ejecuta una prueba real contra Producción;
- modifica GitHub;
- despliega Azure;
- despliega GitHub Pages;
- despliega Netlify.

## 20. Próxima fase

Fase 6 queda reservada para la validación/cierre V001: escenarios terminales, regresiones, aceptación y comprobaciones finales del módulo completo.
