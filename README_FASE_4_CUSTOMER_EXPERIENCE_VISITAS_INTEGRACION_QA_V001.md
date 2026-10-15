# BLT NOW | Customer Experience > Visitas | FASE 4 INTEGRACION Y QA V001

**Entrega de CODIGO (no solo MD): cierre incremental de Fases 1 + 2 + 3, pruebas de regresion e instalador reversible.**

- Fecha: 2026-10-15.
- Repositorio: `ziSirrush/GestorMantto`, rama `main`.
- Base exacta revisada: `c8923226b70f8bc63d13f14fc7390ba41599ddfc`, **Version 101526.4**.
- Aplicativo/Netlify: **BLT NOW**; PWA GitHub Pages: **BLT NOW GH**.
- Dominio/agrupacion: `CORELLIAN` / `CUSTOMER_EXPERIENCE`.
- Ruta frontend: `cx-visitas`; API: `/api/customer-experience/visitas`.
- **Ningun cambio de este paquete se aplico a GitHub, Aiven, Azure, Netlify ni GitHub Pages.**

## 1. Objetivo y cambio funcional real

La Fase 4 confirma el contrato entre las entregas anteriores y corrige un hueco funcional:

**Antes:** Fase 2 permitia consultar el historial de una visita desactivada por ID, pero Fase 3 solo ofrecia un boton de historial dentro del detalle de visitas activas. Al desactivar una visita, ya no aparecia en la lista y el usuario no tenia acceso visual a su historial.

**Ahora:** se agrega al frontend un formulario **"Historial por ID"**, visible solo cuando hay acceso a historial, que permite recuperar el historial de una visita activa o con baja logica usando el endpoint existente `GET /api/customer-experience/visitas/:id/historial`. No se agregan rutas, permisos, tablas, ni estatus nuevos. El backend continua resolviendo JWT + permiso + alcance y devuelve 404 para registros fuera de alcance. No hay acceso anonimo ni bypass.

El modulo sigue limitado al estado `BORRADOR`, tal como F1-F3. No se inventan flujos de visitas realizadas, fotografias, GPS, notificaciones, encuestas, check-in, reportes ni correo.

## 2. Contenido de entrega (archivos nuevos sobre la raiz del repo)

1. `release/cx-visitas-fase4/customer-experience-visitas.js` — **archivo COMPLETO** del frontend F4, actualizado y validado.
2. `release/cx-visitas-fase4/customer-experience-visitas.fase3.original.js` — respaldo completo, verificado de Fase 3 para rollback automatizado. NO copiar manualmente al modulo.
3. `tools/apply-cx-visitas-fase4-v001.cjs` — instalador incremental: `--check`, aplicar, `--rollback`.
4. `tools/qa-cx-visitas-fase4-v001.cjs` — gate de release, offline y de solo lectura; verifica F1/F2/F3/F4 y SHA-256 exactos.
5. `tests/cx-visitas-fase4.test.cjs` — pruebas de codigo + integracion simulada F1/F2/F3/F4.
6. `tests/cx-visitas-fase4-http-smoke.cjs` — smoke **optativo**, contra staging real. Solo lectura por defecto; canary de escritura requiere doble confirmacion.
7. `database/03_PRECHECK_RELEASE_CX_VISITAS_V001.sql` — diagnostico SQL **solo lectura** de esquema, permisos, auditoria y contadores.
8. `docs/ROLLBACK_FASE_4_CX_VISITAS_V001.md` — rollback reversible sin borrar tablas/datos.
9. `docs/QA_MATRIZ_FASE_4_CX_VISITAS_V001.md` — criterios verificables, riesgos y estado de salida.
10. `MANIFEST_FASE_4_CX_VISITAS_V001.txt` — manifiesto de archivos.
11. `docs/CHECKSUMS_FASE_4_CX_VISITAS_V001.sha256` — integridad del ZIP.
12. Este `README_FASE_4_CUSTOMER_EXPERIENCE_VISITAS_INTEGRACION_QA_V001.md`.

**La extraccion NO reescribe archivos existentes de BLT NOW.** El instalador valida ANTES de cualquier reemplazo. Solo al ejecutar la orden de aplicar, genera y sustituye atomicamente estos 3 archivos completos:

- `modules/customer-experience-visitas/customer-experience-visitas.js`: usa la version F4 completa y no modifica su CSS.
- `core/app.js`: actualiza exclusivamente el recurso JS del modulo a `...fase4-v001`, conservando los bindings de Fase 3 y todos los otros modulos.
- `index.html`: cambia exclusivamente la version del recurso `core/app.js` a `...cx-visitas-fase4-v001` para prevenir PWA/cache anterior.

**No altera** `core/router.js`, `core/module-loader.js`, `service-worker.js`, `netlify.toml`, `manifest.json`, `manifest-github.json`, Dashboard CX, Encuestas, backend, tablas ni permisos.

## 3. Requisitos OBLIGATORIOS antes de la instalacion

1. Clon local de BLT NOW con el commit base `c8923226` disponible en Git (`git show c8923226:core/app.js`). El instalador F4 necesita ese blob para reconstruir y comparar la salida **exacta** de F3. Si el repo se actualizo o no dispone del objeto, BLOQUEA: integrar sobre main vigente antes, sin forzar.
2. Fase 1 aplicada en Aiven y verificada con SQL `02_SMOKE_FASE_1_CX_VISITAS_V001.sql`: tablas `cx_visitas` y `cx_visitas_historial`, permisos `ACCESO_VISUAL`, `VER`, `CREAR`, `EDITAR`, `DESACTIVAR`, `VER_HISTORIAL`. F4 **NO** ejecuta ni sustituye esta migracion.
3. Fase 2 Backend V001 instalada en el clon (el archivo `customer-experience.routes.js` debe tener el SHA-256 exacto de F2 `8b6f38861db38b74cbc6faa1e314566f2155836a90d7e905c7b7a5b76551b16d`).
4. Fase 3 Frontend V001 instalada y aplicada con `tools/apply-cx-visitas-fase3-v001.cjs`. JS original F3 SHA-256: `76319556cd518f431a104819377f77a21cdad1f555564016970e3bbf4432a45c`. CSS F3 sin cambios.
5. Sin cambios locales ajenos en `core/app.js`, `index.html` o el JS de Visitas. F4 verifica el CONTENIDO COMPLETO y aborta ante divergencia.
6. Para publicar/validar con datos reales: backend Azure y Aiven accesibles, rol/prueba con permisos y alcance CORELLIAN. No conceder roles desde scripts F4.

## 4. Aplicacion en Windows PowerShell

Trabajar en copia/clon local, NUNCA extraer primero sobre el sitio publicado ni aplicar automaticamente en servidor.

```powershell
Set-Location 'C:\RUTA\AL\GestorMantto'
git status --short
git rev-parse HEAD
# Extrae F4 ZIP sobre la RAIZ; sus rutas son nuevas y no reescriben el sistema.
Expand-Archive 'C:\DESCARGAS\BLT_NOW_CX_VISITAS_FASE_4_INTEGRACION_QA_V001.zip' -DestinationPath .

# Validacion SIN escritura (requiere que F1-F3 ya esten presentes):
node tools/apply-cx-visitas-fase4-v001.cjs --check
# Aplica exactamente el delta F4 en los tres archivos completos:
node tools/apply-cx-visitas-fase4-v001.cjs
# Repetir no duplica el cambio: FASE4_YA_APLICADA.

# Gate local completo, sin tocar BD ni red:
node tools/qa-cx-visitas-fase4-v001.cjs

# Regresion de las cuatro fases (55 tests locales):
node --test tests/cx-visitas-fase1.test.cjs tests/cx-visitas-fase2.test.cjs tests/cx-visitas-fase3.test.cjs tests/cx-visitas-fase4.test.cjs

node --check core/app.js
node --check modules/customer-experience-visitas/customer-experience-visitas.js
git diff --check
git diff -- core/app.js index.html modules/customer-experience-visitas/customer-experience-visitas.js
git status --short
```

**BLOQUEO:** Si el instalador detecta cambios extra, instalacion parcial o ausencia de base SHA, **NO usar `--force`** (no existe tal opcion). Rebasar/portar manualmente a una nueva version con comparacion de commits. El paquete fue calculado para `101526.4`, no para futuros HEAD arbitrarios.

## 5. Validaciones para staging y Aiven

### Aiven (diagnostico solo lectura)

Ejecutar desde cliente MySQL autorizado, seleccionar base `mydb` y ejecutar en orden:

1. `database/02_SMOKE_FASE_1_CX_VISITAS_V001.sql` (archivo F1).
2. `database/03_PRECHECK_RELEASE_CX_VISITAS_V001.sql` (archivo F4).

La consulta F4 comprueba InnoDB, nombres de columnas, cadena de 6 permisos, eventos huerfanos, registros activos/inactivos, datos solo agregados. No modifica la BD ni muestra PII. Los resultados deben interpretarse: **No se han ejecutado en Aiven desde este entorno.**

### Azure / API (lectura segura)

Configurar en el backend SOLO despues de comprobar schema/permisos:

- `CX_VISITAS_API_ENABLED=true` (valor exacto) en el servicio Azure que contiene F2.
- Usar un token JWT de **usuario humano de pruebas** con `ACCESO_VISUAL`, `VER` y `VER_HISTORIAL`, puerta/alcance CORELLIAN. `BLT_CX_VISITAS_DEVICE_TOKEN` opcional si la politica del sitio lo exige.
- No colocar tokens en codigo, ZIP, consola, URL ni repositorio. Pasar por variables locales de entorno.

Ejemplo PowerShell (URL y JWT deben definirse manualmente con datos del entorno seguro; **no** hay credenciales dentro del ZIP):

```powershell
$env:BLT_CX_VISITAS_API_BASE = 'https://TU-API-AZURE'
$env:BLT_CX_VISITAS_TEST_TOKEN = '<JWT_DE_PRUEBAS>'
# Opcional, valida que la version Frontend F4 este publicada:
$env:BLT_CX_VISITAS_FRONTEND_URL = 'https://TU-NETLIFY/'
node tests/cx-visitas-fase4-http-smoke.cjs
```

Smoke de solo lectura: anonimo denegado, listado autorizado paginado, detalle/historial cuando haya filas, paginacion invalida HTTP 400, fuente Aiven y comprobacion opcional de assets/marcas de PWA. Opcional: `BLT_CX_VISITAS_DENIED_TOKEN` para usuario sin privilegios, exigira HTTP 403. Si `CX_VISITAS_API_ENABLED` sigue apagado, antes de habilitarla puede ejecutarse la comprobacion explicita `node tests/cx-visitas-fase4-http-smoke.cjs --expect-disabled` (HTTP 503 esperado).

### Canary opcional de escritura SOLO en STAGING

**NO ejecutar sobre produccion**, porque deja una visita desactivada en Aiven y su historial de auditoria. Requiere usuario de QA con CREAR/EDITAR/DESACTIVAR/VER_HISTORIAL ademas de VER y acceso visual.

```powershell
$env:BLT_CX_VISITAS_DEPLOY_ENV = 'STAGING'
$env:BLT_CX_VISITAS_CANARY_WRITE_CONFIRM = 'CONFIRMO_STAGING_Y_BAJA_LOGICA'
node tests/cx-visitas-fase4-http-smoke.cjs --write-canary
```

Este comando crea una visita de prueba, la edita, consulta el historial, efectua **baja logica** (no borra la fila), confirma 404 en detalle e historial accesible. Si algo falla intenta desactivarla y muestra su ID para limpieza manual. El token y valores PII no se imprimen.

## 6. Pruebas REALIZADAS vs NO realizadas

**Comprobado localmente al generar esta entrega:**

- Fase 1: **8/8** pruebas Node.
- Fase 2: **12/12** pruebas Node con repositorio/scope simulado.
- Fase 3: **20/20** pruebas Node con API simulada.
- Fase 4: **15/15** pruebas Node que usan codigo F2 real en servicio con repositorio simulado y frontend F4 real; comprueban historial por ID de una baja logica.
- Total **55/55** pruebas locales PASS tras reemplazar JS F3 por JS F4 en staging local.
- Pruebas visuales F4 en Chromium headless (API SIMULADA): escritorio **1380px**, tablet **768px** y movil **390px**. Modal de historial por ID visible, cero errores JS y sin desbordamiento horizontal.
- ZIP de F1, F2 y F3 se inspeccionaron, se comprobaron checksums de fuentes y se verifico integridad de archivos entregados por fases.

**NO realizado y debe hacerse antes de dar por publicada la Fase 4:**

- Comprobacion de tablas, permisos y roles contra Aiven real.
- Pruebas HTTP con JWT real, prueba de usuario sin permiso, modo Visor y acceso de produccion.
- Canary de escritura en staging.
- Pruebas E2E navegando una publicacion real en Netlify/GitHub Pages y Azure.
- Deploy, cambios de entorno o versionado publicos.

**Este paquete es aplicable y probado localmente con mocks, pero NO se declara produccion validada** sin la evidencia anterior. No inventar resultados de pruebas externas.

## 7. Salida y rollback

Los criterios de salida del modulo son los de `docs/QA_MATRIZ_FASE_4_CX_VISITAS_V001.md`. El smoke externo y el diagnostico Aiven solo pasan cuando se ejecutan en el entorno correspondiente.

Si falla F4, antes de tocar SQL/F2/F3 se puede revertir exactamente los tres archivos modificados por este instalador:

```powershell
node tools/apply-cx-visitas-fase4-v001.cjs --rollback --check
node tools/apply-cx-visitas-fase4-v001.cjs --rollback
```

El instalador restaura los archivos completos a F3; si encuentra diferencias o ediciones ajenas BLOQUEA. Ver tambien `docs/ROLLBACK_FASE_4_CX_VISITAS_V001.md`.

No revertir F1/Datos si solo se quiere retirar un elemento visual. Apagar `CX_VISITAS_API_ENABLED` antes de revertir backend si existe riesgo real, pero no cambiar la bandera automaticamente.
