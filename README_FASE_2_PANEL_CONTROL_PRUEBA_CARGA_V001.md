# FASE 2 - PANEL DE CONTROL / PRUEBA DE CARGA V001

**Fecha:** 28/09/2026  
**Repositorio verificado:** `ziSirrush/GestorMantto`  
**Rama:** `main`  
**HEAD verificado:** `37780b376465b8906823bc46fed571f3210eff4a` (`Version 092826.1`)  
**Prerrequisito:** `FASE_1_PANEL_CONTROL_PRUEBA_CARGA_V001`

## Objetivo

Agregar la **sesión temporal y la telemetría efímera** del tab `Panel de Control > Prueba de Carga`.

Fase 2 todavía **NO genera carga** y todavía **NO ejecuta k6**. Deja lista la capa que medirá la carga cuando se integre el runner en Fase 3.

## Alcance implementado

- registro de sesiones únicamente en RAM;
- una sola sesión `LISTA` o `EJECUTANDO` por servidor;
- `session-id` y token efímero;
- el token se conserva hasheado en backend y no aparece en snapshots ni reportes;
- TTL para sesión preparada y TTL de resultados terminados;
- eliminación automática por TTL o reinicio de Node;
- middleware especializado para tráfico marcado con:

```text
X-Mantto-Load-Test
X-Mantto-Load-Test-Token
```

- contexto `AsyncLocalStorage` para asociar las queries al request de prueba correcto;
- métricas HTTP por endpoint;
- latencia backend p50 / p90 / p95 / p99;
- requests activos y máximo simultáneo observado;
- métricas Node.js: CPU, RSS, heap, external, uptime y Event Loop Delay;
- métricas del host: CPU, RAM y load average cuando el SO lo soporta;
- métricas MySQL disponibles mediante lectura `SHOW GLOBAL STATUS`;
- telemetría temporal de queries SQL y `getConnection()`;
- fingerprints SQL y `sql_shape` adicionalmente anonimizado para el colector de carga;
- límites de memoria para muestras, endpoints y fingerprints;
- UI para preparar, consultar, detener y limpiar la sesión temporal;
- recuperación visual de una sesión preparada después de recargar, sin recuperar el token efímero.

## Capacidad

Se mantiene la decisión aprobada:

```text
LOAD_TEST_MAX_VUS=200
```

es únicamente el **máximo operativo inicial configurado**.

No existe un máximo duro codificado. En el futuro puede configurarse, por ejemplo:

```text
LOAD_TEST_MAX_VUS=1000
```

sin reescribir el módulo.

## Persistencia

**Ninguna.**

Fase 2 no crea ni modifica tablas, columnas o índices y no guarda resultados en:

- MySQL;
- archivos;
- `localStorage`;
- `sessionStorage`;
- IndexedDB.

La única lectura técnica nueva a MySQL es `SHOW GLOBAL STATUS`. Si el usuario de BD no puede consultar alguna métrica, se reportará `N/D`; el módulo no eleva privilegios.

## Endpoints de Fase 2

```text
GET    /api/panel-control/prueba-carga/capabilities
POST   /api/panel-control/prueba-carga/session
GET    /api/panel-control/prueba-carga/session/:id
POST   /api/panel-control/prueba-carga/session/:id/start
POST   /api/panel-control/prueba-carga/session/:id/stop
DELETE /api/panel-control/prueba-carga/session/:id
```

La autenticación normal del Gestor continúa aplicando. Los permisos creados en Fase 1 continúan siendo la frontera funcional.

## Archivos modificados completos

- `backend/.env.example`
- `backend/src/app.js`
- `backend/src/config/db.js`
- `backend/src/modules/panel-control-prueba-carga/panel-control-prueba-carga.constants.js`
- `backend/src/modules/panel-control-prueba-carga/panel-control-prueba-carga.controller.js`
- `backend/src/modules/panel-control-prueba-carga/panel-control-prueba-carga.routes.js`
- `backend/src/modules/panel-control-prueba-carga/panel-control-prueba-carga.service.js`
- `backend/src/modules/panel-control-prueba-carga/README.md`
- `backend/src/modules/panel-control-prueba-carga/CHANGELOG.md`
- `modules/panel-control-prueba-carga/panel-control-prueba-carga.js`
- `modules/panel-control-prueba-carga/panel-control-prueba-carga.css`
- `modules/panel-control/panel-control.js`
- `core/module-loader.js`

## Archivos nuevos

- `backend/src/modules/panel-control-prueba-carga/panel-control-prueba-carga.context.js`
- `backend/src/modules/panel-control-prueba-carga/panel-control-prueba-carga.registry.js`
- `backend/src/modules/panel-control-prueba-carga/panel-control-prueba-carga.mysql-metrics.js`
- `backend/src/modules/panel-control-prueba-carga/panel-control-prueba-carga.telemetry.js`
- `tests/panel-control-prueba-carga-fase2.test.js`

## Base de datos

**No hay SQL en Fase 2.**

Los permisos de Fase 1 son prerrequisito. Fase 2 no requiere nueva migración ni rollback SQL.

## Variables nuevas documentadas

```text
LOAD_TEST_READY_TTL_SECONDS=900
LOAD_TEST_RESULT_TTL_SECONDS=900
LOAD_TEST_ACTIVE_GRACE_SECONDS=120
LOAD_TEST_TELEMETRY_SAMPLE_MS=1000
LOAD_TEST_SLOW_QUERY_MS=750
LOAD_TEST_MAX_SYSTEM_SAMPLES=600
LOAD_TEST_MAX_ENDPOINTS=100
LOAD_TEST_MAX_FINGERPRINTS=100
LOAD_TEST_MAX_LATENCY_SAMPLES=4096
LOAD_TEST_MAX_ENDPOINT_LATENCY_SAMPLES=512
```

Son valores opcionales; el código incluye defaults seguros si no están definidos.

## Validaciones realizadas

### Validación estática

`node --check` sobre todos los JS modificados/nuevos de Fase 2: **PASS**.

### Pruebas específicas de Fase 2

```text
node --test tests/panel-control-prueba-carga-fase2.test.js
```

Resultado: **5/5 PASS**.

Valida:

- una sola sesión activa;
- token efímero no expuesto;
- token incorrecto rechazado;
- asociación de HTTP / SQL / pool / sistema;
- TTL de sesión y de resultados;
- limpieza de sesión;
- propagación de `AsyncLocalStorage`;
- `LOAD_TEST_MAX_VUS=1000` sin cambio de código;
- anonimización adicional de literales numéricos del `sql_shape` temporal.

### Regresión del backend vigente

Sobre reconstrucción del `main` verificado + Fase 1 + Fase 2:

```text
backend/npm run check
```

Resultado: **PASS**.

```text
backend/npm test
```

Resultado: **76/76 PASS**.

El artifact de GitHub Pages no contiene `.github`; para reproducir la última prueba se repuso exactamente el workflow de Azure leído del mismo `main` verificado. No se modificó el workflow.

### Carga del backend

`require('./backend/src/app')` con variables DB de laboratorio ficticias, sin conectar a BD: **PASS**. Esto valida carga de módulos/ciclos de dependencias, no conexión real.

### Persistencia / estructura

- búsqueda de DDL (`CREATE/ALTER TABLE`): **sin cambios de esquema**;
- almacenamiento web persistente en submódulo: **no encontrado**;
- escritura de archivos desde el submódulo: **no encontrada**;
- trailing whitespace en archivos de Fase 2: **PASS**.

## Validaciones NO ejecutadas

- prueba real de carga: NO;
- k6: NO integrado todavía;
- prueba contra producción: NO;
- E2E en navegador: NO;
- lectura real de `SHOW GLOBAL STATUS` contra Aiven: NO;
- despliegue Azure: NO;
- despliegue GitHub Pages: NO;
- despliegue Netlify: NO.

## Aplicación

1. Confirmar que **Fase 1** ya está aplicada.
2. Copiar los archivos de este ZIP respetando exactamente su estructura.
3. No ejecutar SQL para Fase 2.
4. Reiniciar el backend.
5. Abrir `Panel de Control > Prueba de Carga`.
6. Debe mostrar `FASE 2 · TELEMETRÍA EFÍMERA`.
7. Preparar una sesión de prueba de 10 VUs.
8. Confirmar que aparece `session-id`, estado `LISTA`, fecha de expiración y mensaje de token efímero generado.
9. Confirmar que una segunda sesión simultánea queda bloqueada.
10. Pulsar `Limpiar sesión` y confirmar que desaparece.

No es necesario iniciar una carga real en esta fase.

## Reversión

- restaurar `backend/src/app.js` y `backend/src/config/db.js` a `main @ 37780b3`;
- restaurar los archivos modificados del submódulo, `panel-control.js`, `module-loader.js` y `.env.example` a sus versiones de Fase 1;
- eliminar los cuatro archivos backend nuevos de telemetría/contexto/registry/MySQL y el test nuevo.

No existe reversión de BD porque Fase 2 no modifica datos ni esquema.

## Sistemas modificados por esta entrega

**Ninguno.** Este ZIP únicamente prepara archivos locales.

- GitHub: sin cambios;
- Aiven: sin cambios;
- Azure: sin cambios;
- GitHub Pages: sin cambios;
- Netlify: sin cambios.

## Siguiente fase

**Fase 3:** runner k6 externo y escenarios de carga de solo lectura, utilizando esta sesión y telemetría efímera.
