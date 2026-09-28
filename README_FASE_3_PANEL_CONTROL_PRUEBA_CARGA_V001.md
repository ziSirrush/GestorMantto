# FASE 3 - PANEL DE CONTROL / PRUEBA DE CARGA V001

**Fecha:** 28/09/2026
**Proyecto:** Mantto Gestor
**Ubicación funcional:** `Panel de Control > Prueba de Carga`
**Base de integración:** workspace local vigente entregado como `Version Local.zip` + correcciones de Fase 2
**HEAD Git del workspace:** `37780b376465b8906823bc46fed571f3210eff4a` (`Version 092826.1`)
**Importante:** el workspace contiene trabajo local posterior al HEAD. Esta Fase 3 fue fusionada sobre esos archivos locales; no se reconstruyó desde `main` ni se reemplazó `panel-control.js` por una copia antigua.

## Objetivo

Implementar el **runner k6 externo seguro** para Prueba de Carga, cerrando antes de Fase 4 los riesgos de credenciales, target, redirecciones, sesión efímera, una sola instancia/proceso y separación de identidad operadora/funcional.

Fase 3 permite preparar una sesión desde el tab y ejecutarla desde otra PC mediante k6. **No implementa todavía el botón de detención real, métricas k6 en vivo ni el reporte final de k6**; esos puntos corresponden a Fases 4 y 5.

## Decisiones implementadas

### 1. Runner externo

k6 continúa ejecutándose en **otra PC**, no en el mismo servidor/proceso Node que se mide.

Archivos nuevos:

```text
scripts/load-test/mantto-gestor-load-test.config.js
scripts/load-test/mantto-gestor-load-test.k6.js
scripts/load-test/iniciar-mantto-load-test.ps1
```

La pantalla muestra un comando que contiene únicamente el `session-id`. El `session-id` no es una credencial.

### 2. Credenciales sin exposición en pantalla

El navegador ya no recibe `runner_token` al preparar la sesión.

Flujo implementado:

```text
Panel prepara sesión LISTA
        ↓
runner externo autentica al Programador general propietario
        ↓
POST /runner-claim
        ↓
backend comprueba permiso + propietario + estado LISTA
        ↓
genera token efímero
        ↓
almacena únicamente SHA-256(token)
        ↓
entrega token una sola vez al runner
        ↓
segundo claim => 409
```

El launcher pide mediante `Read-Host -AsSecureString`:

1. JWT del **Programador general propietario** de la sesión;
2. JWT de una **identidad de prueba separada** con permisos de lectura para el escenario.

Los JWT no son parámetros de línea de comandos, no se escriben en archivos y no se imprimen. Se pasan al proceso k6 mediante variables de entorno heredadas y se eliminan del proceso del launcher al finalizar.

### 3. Identidad separada para tráfico funcional

El JWT del Programador general se utiliza únicamente para control de la sesión (`capabilities`, lectura de sesión, `runner-claim`, `start` y liberación).

Las solicitudes funcionales de carga usan `MANTTO_TEST_JWT`, distinto al JWT del operador. El operador debe proporcionar una cuenta de prueba con permisos de lectura suficientes para el escenario.

Además, el backend de Fase 2 sigue rechazando cualquier solicitud marcada de carga cuyo método no sea `GET` o `HEAD` antes de llegar a una ruta de negocio.

### 4. Target cerrado

El origen de producción verificado en el workspace vigente es:

```text
https://mantto-gestor-api-a4hwfpgvbeb4gmgj.mexicocentral-01.azurewebsites.net
```

Se encuentra también en `core/config.js` y se usa como origen confiable versionado del runner.

Backend exige:

```text
LOAD_TEST_ALLOWED_ORIGIN=<origen exacto autorizado>
```

Se valida protocolo, host y puerto. No se acepta ruta, query, hash ni credenciales embebidas.

El payload de creación de sesión no admite `target`, `url`, `base_url`, `baseUrl` ni `host`.

Si existe `TARGET_URL` en el ambiente del runner y no coincide exactamente con el origen confiable, k6 se detiene **antes del claim autenticado**.

### 5. Redirecciones desactivadas

El runner configura:

```js
maxRedirects: 0
```

y cada request utiliza:

```js
redirects: 0
```

Un `3xx` se trata como condición de aborto; el runner no debe seguirlo hacia otro origen.

### 6. Una sola réplica / un solo proceso backend

V001 se habilita únicamente cuando la operación confirma:

```text
LOAD_TEST_SINGLE_INSTANCE=true
```

El runtime también falla cerrado si Node está operando como worker de `cluster`.

Cada proceso genera un identificador efímero `PROCESS_INSTANCE_ID`. El `runner-claim` lo entrega al runner y cada request funcional debe devolver/usar el mismo identificador mediante:

```text
X-Mantto-Load-Test-Instance
```

Si una solicitud llega a otro proceso, el middleware responde `421 / LOAD_TEST_INSTANCE_MISMATCH` antes de ejecutar la ruta de negocio.

**Límite verificable:** un proceso Node no puede demostrar por sí solo cuántas réplicas externas tiene la plataforma sin un coordinador compartido. Por eso `LOAD_TEST_SINGLE_INSTANCE=true` es una confirmación operativa y debe corresponder a la configuración real del hosting. El código no sustituye esa configuración.

### 7. Una sola prueba activa

El registry continúa permitiendo una sola sesión `LISTA` o `EJECUTANDO`.

Cuando la sesión termina, se detiene, se elimina o vence su TTL, puede prepararse otra. `FINALIZANDO` se incorpora en Fase 4 junto con la detención real de k6.

### 8. Escalabilidad sin tope fijo de 200

La autoridad continúa siendo:

```text
LOAD_TEST_MIN_VUS
LOAD_TEST_VUS_STEP
LOAD_TEST_MAX_VUS
```

La meta inicial es **200 VUs**, pero no existe un límite duro de 200. Se validó la configuración con `LOAD_TEST_MAX_VUS=1000` sin modificar código.

Los VUs deben estar dentro del máximo configurado y respetar el paso definido.

## Catálogo técnico de escenarios

Versión: `20260928-v001`.

```text
SALUD
  GET /api/health

HOME
  GET /api/home/bootstrap

CALL_CENTER
  GET /api/operacion/dashboard-call-center/inicial

MIXTO_LECTURA
  GET /api/home/bootstrap
  GET /api/home/snapshot
  GET /api/operacion/dashboard-call-center/inicial
  GET /api/health
```

El runner no acepta URLs funcionales libres. El catálogo backend y el catálogo versionado del runner deben coincidir exactamente antes de iniciar.

## API agregada en Fase 3

```text
POST /api/panel-control/prueba-carga/session/:id/runner-claim
```

Contratos relevantes:

- solo actor autenticado (`req.user`);
- requiere permiso efectivo `EJECUTAR`;
- requiere ser propietario de la sesión;
- bloqueado en modo Visor;
- solo sesión `LISTA`;
- claim de un solo uso;
- entrega una vez el token plano al runner;
- el registry conserva solo el hash del token.

## Variables de entorno nuevas

```text
LOAD_TEST_SINGLE_INSTANCE=false
LOAD_TEST_ALLOWED_ORIGIN=https://mantto-gestor-api-a4hwfpgvbeb4gmgj.mexicocentral-01.azurewebsites.net
```

Para ejecutar una prueba real V001 se requiere que la infraestructura esté realmente en una sola réplica/proceso y entonces configurar:

```text
LOAD_TEST_SINGLE_INSTANCE=true
```

`false` queda como default seguro: si no se confirma explícitamente la condición, no se puede preparar una prueba.

## Archivos modificados por Fase 3

- `backend/.env.example`
- `backend/src/modules/panel-control-prueba-carga/CHANGELOG.md`
- `backend/src/modules/panel-control-prueba-carga/README.md`
- `backend/src/modules/panel-control-prueba-carga/panel-control-prueba-carga.constants.js`
- `backend/src/modules/panel-control-prueba-carga/panel-control-prueba-carga.controller.js`
- `backend/src/modules/panel-control-prueba-carga/panel-control-prueba-carga.registry.js`
- `backend/src/modules/panel-control-prueba-carga/panel-control-prueba-carga.routes.js`
- `backend/src/modules/panel-control-prueba-carga/panel-control-prueba-carga.service.js`
- `backend/src/modules/panel-control-prueba-carga/panel-control-prueba-carga.telemetry.js`
- `core/module-loader.js`
- `implementacion/MODULO_PANEL_CONTROL_PRUEBA_CARGA_V001.md`
- `index.html`
- `modules/panel-control-prueba-carga/panel-control-prueba-carga.js`
- `modules/panel-control/panel-control.js`
- `tests/panel-control-prueba-carga-fase2.test.js`

## Archivos nuevos de Fase 3

- `backend/src/modules/panel-control-prueba-carga/panel-control-prueba-carga.runtime.js`
- `backend/src/modules/panel-control-prueba-carga/panel-control-prueba-carga.scenarios.js`
- `scripts/load-test/mantto-gestor-load-test.config.js`
- `scripts/load-test/mantto-gestor-load-test.k6.js`
- `scripts/load-test/iniciar-mantto-load-test.ps1`
- `tests/panel-control-prueba-carga-fase3.test.js`
- `README_FASE_3_PANEL_CONTROL_PRUEBA_CARGA_V001.md`
- `VALIDACION_FASE_3_PANEL_CONTROL_PRUEBA_CARGA_V001.txt`
- `MANIFEST_FASE_3_PANEL_CONTROL_PRUEBA_CARGA_V001.txt`

`implementacion/CODIGO_AUDITORIA_A_CONSERVAR_V001.md` se incluye en el paquete como **archivo de referencia de integración sin modificar**, por decisión explícita del proyecto.

## Auditoría conservada

Se verificó contra el snapshot exacto anterior a Fase 3 que el bloque protegido desde:

```js
const AUDIT_ZONE='America/Mexico_City';
```

hasta el cierre de `renderChangeAudit(box)` permanece **idéntico byte a byte**.

También permanecen:

- `auditWeek`, `auditCompany`, `auditModule`, `auditType`, `auditLayer`;
- tab `Auditoría`;
- rama de `renderMain()` antes de `bootLoading/error`;
- `.pc-change-audit`;
- `core/change-audit.generated.js`;
- `core/build-info.generated.js`;
- `audit/changes/`;
- `tools/generate-change-audit.js`;
- generación Pages/Netlify;
- `tests/change-audit-generator.test.js`.

El único cambio de Fase 3 dentro de `modules/panel-control/panel-control.js` es la renovación del `LOAD_TEST_ASSET_VERSION`.

## Persistencia / BD

**No se agrega ninguna tabla, columna, índice ni persistencia.**

- sesiones: RAM del proceso Node;
- token runner: solo hash en RAM;
- resultados Fase 2: RAM;
- JWT: memoria del launcher/k6 durante la ejecución;
- no se agrega SQL de migración.

## Validaciones ejecutadas

### Sintaxis JavaScript

`node --check` sobre runner, catálogo, backend y frontends modificados/nuevos: **PASS**.

### Pruebas Fase 2 + Fase 3

```text
node --test tests/panel-control-prueba-carga-fase2.test.js tests/panel-control-prueba-carga-fase3.test.js
```

Resultado: **27/27 PASS**.

Fase 3 cubre específicamente:

- la pantalla no recibe token;
- `runner-claim` de un uso y hash únicamente;
- fail-closed sin single instance/origin;
- propiedad del claim;
- `LOAD_TEST_MAX_VUS=1000`;
- rechazo de target externo;
- catálogo GET/HEAD fijo;
- mismatch de process-instance antes de negocio;
- redirects desactivados;
- separación de JWT operador/prueba;
- launcher sin secretos en CLI/archivo;
- ausencia de falso botón Detener antes de Fase 4.

### Auditoría

```text
node --test tests/change-audit-generator.test.js
```

Resultado: **5/5 PASS**.

### Backend

```text
cd backend
npm run check
npm test
```

Resultados:

```text
npm run check : PASS
npm test      : 76/76 PASS
```

### Diff de la Fase 3

La copia local entregada ya contiene numerosos cambios preexistentes respecto al commit `37780b3`, incluidos finales de línea/trailing whitespace ajenos a esta fase. Por eso `git diff --check` global contra ese HEAD no es una medida válida para atribuir defectos a Fase 3.

Se genera un diff aislado utilizando como baseline los **bytes exactos del workspace inmediatamente antes de Fase 3**. El resultado de `git diff --check` de ese delta se documenta en `VALIDACION_FASE_3_PANEL_CONTROL_PRUEBA_CARGA_V001.txt`.

## Validaciones no ejecutadas

- ejecución real de k6: **NO**, k6 no está instalado en este entorno de generación;
- parseo/ejecución real del launcher con PowerShell: **NO**, PowerShell no está instalado en este entorno Linux;
- prueba contra Producción: **NO**;
- prueba E2E con navegador: **NO**;
- cambio de Scale Out / número de réplicas Azure: **NO**;
- despliegue Azure: **NO**;
- GitHub commit/push: **NO**;
- GitHub Pages: **NO desplegado**;
- Netlify: **NO desplegado**;
- Aiven: **NO modificado**.

## Aplicación de esta fase

Esta entrega parte de `Version Local.zip` ya fusionado con el FIX de los cuatro hallazgos de Fase 2. Aplicar los archivos respetando exactamente la estructura de carpetas.

Antes de copiar sobre otro workspace:

1. confirmar que contiene las correcciones de Fase 2 y la Auditoría semanal vigente;
2. revisar el diff incluido en este paquete;
3. si alguno de los archivos compartidos cambió después de esta entrega, **fusionar** el cambio en lugar de sustituirlo a ciegas;
4. conservar `implementacion/CODIGO_AUDITORIA_A_CONSERVAR_V001.md` como referencia de integración.

No hay SQL que ejecutar. Las variables `LOAD_TEST_SINGLE_INSTANCE` y `LOAD_TEST_ALLOWED_ORIGIN` son configuración de runtime y no deben activarse hasta confirmar las condiciones reales del despliegue.

## Requisito antes de la primera ejecución real

1. Confirmar en la infraestructura que existe **una sola réplica** del backend y **un solo proceso Node**.
2. Configurar en el backend:

```text
LOAD_TEST_SINGLE_INSTANCE=true
LOAD_TEST_ALLOWED_ORIGIN=https://mantto-gestor-api-a4hwfpgvbeb4gmgj.mexicocentral-01.azurewebsites.net
```

3. Reiniciar backend después de cambiar variables.
4. Instalar k6 únicamente en la PC externa generadora de carga.
5. Utilizar un usuario **Programador general** propietario para preparar/reclamar la sesión.
6. Utilizar una cuenta de prueba distinta, con acceso de lectura a los módulos del escenario.
7. Abrir `Panel de Control > Prueba de Carga`, preparar la sesión y copiar únicamente el comando sin secretos que muestra la pantalla.
8. Ejecutar el launcher desde la PC externa e introducir los dos JWT cuando los solicite.

**No iniciar todavía pruebas agresivas en Producción hasta integrar Fase 4**, porque Fase 3 deliberadamente no expone un botón de detención que pretenda detener k6 sin controlar realmente el proceso externo.

## Reversión

Revertir **únicamente el delta de Fase 3**. No restaurar `panel-control.js`, `core/module-loader.js` o `index.html` desde `main @ 37780b3`, porque eso eliminaría Auditoría y otros cambios locales posteriores.

Eliminar los seis archivos técnicos nuevos de Fase 3 y restaurar los archivos modificados a la baseline inmediatamente posterior al FIX de Fase 2.

No existe rollback SQL.

## Entregable auxiliar de comparación

Se entrega también `DIFF_FASE_3_PANEL_CONTROL_PRUEBA_CARGA_V001.patch`, generado contra los bytes exactos del workspace inmediatamente anterior a Fase 3. Sirve para revisar el delta; **no debe aplicarse a ciegas sobre un workspace que haya cambiado después**, porque `panel-control.js` y otros archivos compartidos deben fusionarse con el estado local vigente.

## Fuentes técnicas externas verificadas

Documentación oficial Grafana k6 consultada el 28/09/2026:

- Options reference / `maxRedirects`: https://grafana.com/docs/k6/latest/using-k6/k6-options/reference/
- HTTP requests / redirects: https://grafana.com/docs/k6/latest/using-k6/http-requests/
- `k6/execution` / `exec.test.abort()`: https://grafana.com/docs/k6/latest/javascript-api/k6-execution/
- Execution context / VUs activos (para Fase 4): https://grafana.com/docs/k6/latest/using-k6/execution-context-variables/
- `handleSummary()` (reservado para Fase 5): https://grafana.com/docs/k6/latest/results-output/end-of-test/custom-summary/

## Sistemas modificados por esta entrega

**Solo el workspace local utilizado para preparar el ZIP.**

- GitHub: NO modificado;
- Aiven: NO modificado;
- Azure: NO modificado;
- GitHub Pages: NO desplegado;
- Netlify: NO desplegado;
- base de datos: NO modificada.

## Siguiente fase

**Fase 4:** canal de control del runner, `FINALIZANDO`, detención real mediante aborto de k6 y métricas temporales del runner separadas de las métricas del backend.
