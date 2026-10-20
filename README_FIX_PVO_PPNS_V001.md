# FIX BLT NOW - Logistica > PVO-Produccion - Identidad PPNS V001

- Fecha: 20/10/2026
- Fuente de codigo: `ziSirrush/GestorMantto`, `main`, commit **`7f497d121eb26ec6a121140a19c334c6e16d57ab`** (Version 101926.6).
- Entorno objetivo: primero local, y despues backend Azure solo con aprobacion; frontend sin cambios en este fix. **No se despliega automaticamente**.
- Estado: **preparado y validado estaticamente en entorno aislado**; sin acceso de lectura/escritura a Aiven actual; sin E2E en la aplicacion real.
- Normativa: `PROJECT_CONSTITUTION.md` v2, cambios localizados, identificadores estructurados, fail-closed, no escrituras remotas sin autorizacion.

## Causa y criterio de seguridad

La FK `logistica_produccion.id_log_ops -> log_ops.id_log_ops` solo demuestra que la fila existe. No prueba que `logistica_produccion.ppns = log_ops.id_ppns`. El backend usaba nombre/PPNS de `log_ops` en el listado aunque las fechas y archivos permanecen bajo `id_produccion`; `ins_fl` se relaciona por `id_proyecto = ppns`.

Un proyecto es el mismo solo cuando los PPNS coinciden (ignorando espacios exteriores y diferencias de mayusculas). `ins_fl` contiene varias filas por equipo; su ausencia **no** bloquea un PVO valido. No se relacionan documentos por texto de nombre de proyecto.

## Cambios exactos

1. `backend/src/controllers/logistica.controller.js` - al sincronizar `log_ops`, bloquea la reutilizacion/cambio de PPNS de un `id_log_ops` ya asociado a PVO, y comprueba si la asociacion previa ya era inconsistente; no bloquea actualizaciones de estatus u otros campos de PPNS coincidentes.
2. `backend/src/modules/logistica-produccion/logistica-produccion.repository.js` - valida el PPNS dentro de las transacciones de alta y edicion; impide reasignar `id_log_ops` de un PVO existente, restringe consultas de documentos y la conciliacion de Instalaciones a vinculos consistentes, conserva filtros por el PPNS propio cuando el vinculo esta mal.
3. `backend/src/modules/logistica-produccion/logistica-produccion.service.js` - pone en cuarentena visual registros inconsistentes (proyecto generico `Registro con vinculo en revision`, sin datos combinados ni fechas/documentos); `GET detalle`, lecturas de archivos, ediciones y movimientos sensibles fallan con 409. Documentos y reportes PVO omiten los registros bloqueados, sin eliminarlos.
4. `backend/src/modules/logistica-produccion/logistica-produccion-sync.service.js` - exige PPNS coincidente al importar y no permite que un mismo `id_produccion` cambie su PPNS/`id_log_ops` al resincronizar; bloquea importacion de archivos a un padre inconsistentemente asociado.
5. `backend/src/modules/logistica-produccion/logistica-produccion-integridad.js` (nuevo) - funcion pura de validacion centralizada, codigo de error `PVO_PPNS_INCONSISTENTE` (HTTP 409).
6. `tests/logistica-pvo-identidad-ppns.test.js` (nuevo) - 11 pruebas unitarias de integridad/sincronizacion/consultas/alta/inmutabilidad; usan mocks, no tocan Aiven/Azure.

## Comportamiento deliberado de los datos historicos

- Las inconsistencias **no se corrigen por intuicion**: un nombre no acredita a que proyecto pertenecen CPVO/GM.
- Los registros inconsistentes permanecen almacenados; el listado muestra un registro en revision y la vista detalle devuelve 409, en vez de exhibir documentos bajo un proyecto distinto.
- La tabla original NO se reescribe ni se pierde: ejecutar `AUDITORIA_PVO_PPNS_SOLO_LECTURA_V001.sql` en Aiven **antes y despues** para identificar afectados.
- Para corregir filas historicas: respaldo de BD, cotejo de PPNS real, archivos, autor y registros de fechas, propuesta de `UPDATE` por `id_produccion` explicitamente aprobada, verificacion posterior y traza de auditoria. **Este paquete no incluye SQL de actualizacion.**

## Aplicacion local (PowerShell, sin publicacion)

1. `git status --short` y `git rev-parse HEAD` en el repo local. Exigir arbol limpio y misma base `7f497d1...`; si avanzo `main`, detenerse y rebasar el fix primero, no sobreescribir codigo nuevo.
2. Extraer el ZIP **fuera** del repo. Copiar exclusivamente las 4 rutas backend modificadas, el nuevo helper y el test; respetar las carpetas. No copiar el README ni el SQL a carpetas runtime si no se desea documentarlos en repo.
3. `node --check` sobre los 5 JS backend. Ejecutar `node --test tests/logistica-pvo-identidad-ppns.test.js` desde la raiz del repo.
4. `git diff --check`, `git diff --stat`, `git status`, revisar cada cambio. Realizar prueba contra restauracion de BD antes de cualquier produccion, incluyendo los registros reportados.
5. Hacer **commit local** solo si las comprobaciones resultan correctas. No hacer `git push` ni desplegar Azure/Netlify sin autorizacion adicional.

## Pruebas recomendadas E2E pendientes

- PVO valido con PPNS presente en `log_ops` pero ausente en `ins_fl`: crear/ver/adjuntar debe funcionar.
- Varios equipos `ins_fl` con el mismo PPNS: agregacion por proyecto sin datos ajenos.
- `p.ppns != l.id_ppns`: listado en revision; detalle/archivos no deben exponer documento ni nombre de otro proyecto; respuesta 409.
- Cambiar `log_ops.id_ppns` con PVO vinculado: rechazo por fila, sin actualizar `log_ops`.
- Editar proyecto de un registro PVO existente (aunque ya tenga CPVO): rechazo 409; las fechas y archivos permanecen en su ID original.
- Probar importacion de migracion con un proyecto correcto y otro incorrecto para confirmar que los `SAVEPOINT` siguen procesando filas independientes.
- Confirmar roles/permisos normales del modulo, autenticacion y accesos por ID existentes.

## Validaciones ejecutadas en esta entrega

- Comparacion de los cuatro archivos base obtenidos de GitHub contra su contenido original (hash FNV-1a local; coincidentes antes de los cambios).
- `node --check` de JS modificados, helper y test: PASS.
- `git diff --check` de cuatro archivos modificados en un repositorio QA aislado: PASS.
- `node --test tests/logistica-pvo-identidad-ppns.test.js`: **11/11 PASS** en entorno aislado con mocks.
- Pruebas sobre Aiven en vivo, Azure, Netlify o E2E reales: **NO ejecutadas**.
- `git push`, migracion SQL, cambios en Aiven/Azure/Netlify/GitHub: **NINGUNO**.

### Limitacion visual consciente

La UI actual conserva un selector de proyecto durante la edicion. Este fix protege el backend y devuelve un error explicito si el usuario intenta cambiarlo. No se modifica el frontend en este paquete para mantener el cambio localizado; la deshabilitacion visual del selector queda como mejora posterior y no como permiso para mover documentos.

## PowerShell para aplicar exclusivamente en un repo local compatible

Ejecutar desde PowerShell despues de guardar el ZIP en Descargas. **No publica**. No usar contra una version distinta del commit base:

```powershell
$ErrorActionPreference = 'Stop'
$REPO = 'C:\Users\T14s\Downloads\mantto_gestor_frontend'
$ZIP = Join-Path $env:USERPROFILE 'Downloads\FIX_BLT_NOW_LOGISTICA_PVO_PPNS_V001.zip'
$BASE = '7f497d121eb26ec6a121140a19c334c6e16d57ab'
Set-Location $REPO
if ((git rev-parse HEAD).Trim() -ne $BASE) { throw 'BASE DIFERENTE: revisar main antes de aplicar; no sobrescribir cambios nuevos.' }
if (@(git status --porcelain).Count -gt 0) { throw 'HAY CAMBIOS LOCALES: guardarlos o revisarlos antes de aplicar.' }
if (-not (Test-Path $ZIP)) { throw 'No se encontro el ZIP.' }
$TEMP_FIX = Join-Path $env:TEMP 'BLT_NOW_PVO_PPNS_V001'
Expand-Archive -LiteralPath $ZIP -DestinationPath $TEMP_FIX -Force
$FILES = @(
  'backend\src\controllers\logistica.controller.js',
  'backend\src\modules\logistica-produccion\logistica-produccion.repository.js',
  'backend\src\modules\logistica-produccion\logistica-produccion.service.js',
  'backend\src\modules\logistica-produccion\logistica-produccion-sync.service.js',
  'backend\src\modules\logistica-produccion\logistica-produccion-integridad.js',
  'tests\logistica-pvo-identidad-ppns.test.js'
)
foreach ($f in $FILES) {
  $src = Join-Path $TEMP_FIX $f
  $dst = Join-Path $REPO $f
  if (-not (Test-Path $src)) { throw "Falta archivo del fix: $f" }
  New-Item -ItemType Directory -Force -Path (Split-Path $dst) | Out-Null
  Copy-Item -LiteralPath $src -Destination $dst -Force
}
foreach ($f in $FILES) {
  if ($f -like '*.js') { node --check (Join-Path $REPO $f); if ($LASTEXITCODE -ne 0) { throw "Error sintaxis: $f" } }
}
node --test 'tests\logistica-pvo-identidad-ppns.test.js'
if ($LASTEXITCODE -ne 0) { throw 'Pruebas unitarias fallidas.' }
git diff --check
if ($LASTEXITCODE -ne 0) { throw 'git diff --check fallo.' }
git status --short
git diff --stat
# Tras revisar, commit local opcional (NO push):
# git add -- backend/src/controllers/logistica.controller.js backend/src/modules/logistica-produccion/logistica-produccion.repository.js backend/src/modules/logistica-produccion/logistica-produccion.service.js backend/src/modules/logistica-produccion/logistica-produccion-sync.service.js backend/src/modules/logistica-produccion/logistica-produccion-integridad.js tests/logistica-pvo-identidad-ppns.test.js
# git commit -m "fix(logistica): aislar PVO por identidad PPNS"
```
