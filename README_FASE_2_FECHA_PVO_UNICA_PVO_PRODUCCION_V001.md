# BLT NOW — Fase 2 · Fecha PVO única en PVO-Producción V001

**Fecha:** 21/10/2026. **Fuente oficial verificada:** GitHub `ziSirrush/GestorMantto`, `main` en `97a0a30a0d269629754afad07dfc054ea9ac831a` (versión `102026.14`).

## Requerimiento aplicado

- **Agregar nuevo:** se elimina el campo independiente «Fecha de Visita». Se conserva «Fecha PVO» y no se envía `fecha_pvo_fl` desde la nueva captura.
- **Detalle / Editar:** se elimina la segunda fecha visible y editable. Una edición de «Fecha PVO» únicamente actualiza `fecha_pvo`; **no modifica** la antigua `fecha_pvo_fl`.
- **PVO-Producción (tabla principal):** se elimina columna, ordenación y filtro «Sin Fecha de Visita». Se actualiza el número de columnas de las filas vacías.
- **PVO (completos/faltantes):** se elimina la columna y causa «Fecha de Visita»; el backend considera completos a los registros con **Fecha PVO + al menos una CPVO activa y una GM activa**, sin exigir la antigua `fecha_pvo_fl`.
- **Datos históricos:** `fecha_pvo_fl` se conserva en MySQL, sin eliminación, sincronización forzada ni migración. Las comparaciones internas con `ins_fl` permanecen disponibles; **no** se cambian otros módulos.

## Integración de entregas previas sin regresiones

Este ZIP entrega los **archivos completos consolidados** para preservar el FIX documental anterior (CPVO + GM activos, Fases 1 y 2) y la **Fase 1 del filtro de proyectos preproducción**. Ambos fixes previos habían modificado el mismo archivo de repositorio backend. Por ello aquí se incluye la **versión fusionada** de ese archivo; omitirla o sobreescribirla con una versión anterior podría deshacer alguno de los filtros. La entrega no crea otra regla de estatus.

**Archivos de runtime (4):**
1. `backend/src/modules/logistica-produccion/logistica-produccion.repository.js`: fusiona reglas documentales existentes y filtro de equipos anteriores a Producción entregado en la Fase 1.
2. `backend/src/modules/logistica-produccion/logistica-produccion.service.js`: deja de exigir `pvo.visita` para determinar completitud. Conserva las validaciones documentales e identidad de PPNS.
3. `modules/logistica-produccion/logistica-produccion.js`: elimina la duplicidad visual y de captura, sin afectar CPVO/GM, edición, carga de archivos ni navegación.
4. `core/module-loader.js`: refresca la versión del JS en las cinco rutas de Logística/PVO/Producción; no modifica CSS ni módulos ajenos.

**Pruebas (4 archivos):** test del filtro preproducción original, tests documentales de Fases 1 y 2 actualizados a la nueva regla y tests nuevos para Fecha PVO única. Incluidos porque la regla anterior de `Fecha de Visita` obligatoria quedó obsoleta.

**No incluidos:** SQL, migraciones, `.patch`, instaladores o despliegues.

## Validaciones realizadas

- `node --check` sobre cuatro archivos JS de runtime y cuatro tests: **correcto**.
- `node --test` de cuatro archivos: **72/72 pruebas aprobadas**, con repositorio backend integrado en un entorno local aislado.
- `git diff --check`: **correcto** en repositorio local simulado.
- **No verificado:** ejecución contra la BD Aiven real, funcionamiento online Azure/Netlify/GitHub Pages ni pruebas E2E de navegador. El esquema de referencia `Sábana Estructura 071026.sql` permite `NULL` en `fecha_pvo_fl`, pero **no se afirma que describa la BD de producción actual**.

## Aplicación local segura — PowerShell

Usar el ZIP en `Descargas` y ajustar `$REPO`. Se validan **SHA Git de las versiones anteriores conocidas**, los archivos del ZIP y la base de Git antes de copiar. Si una ruta fue modificada por otro cambio, el proceso se detiene **sin sobrescribirla**. Se respalda el contenido reemplazado, se ejecutan las pruebas y se restaura si falla una verificación. No hace commit ni push.

```powershell
$ErrorActionPreference = 'Stop'
$REPO = 'C:\Users\T14s\Downloads\mantto_gestor_frontend'  # Ajustar
$ZIP = Join-Path $HOME 'Downloads\FIX_BLT_NOW_FASE_2_FECHA_PVO_UNICA_V001.zip'
$BASE = '97a0a30a0d269629754afad07dfc054ea9ac831a'

Set-Location $REPO
if (-not (Test-Path -LiteralPath $ZIP)) { throw 'ZIP no encontrado.' }
git merge-base --is-ancestor $BASE HEAD
if ($LASTEXITCODE -ne 0) { throw 'HEAD no contiene la base validada. Revisar antes de aplicar.' }

$ALLOW = @{
 'backend\src\modules\logistica-produccion\logistica-produccion.repository.js' = @(
   'd3de96617d6034a27eaea38f60cf4a6d3cec93c6',
   '5a6a59e4fcb6d00970d96fe600120b89bf879ded',
   '9d74e14b1bb0c927bf023282d6421c909e23a724',
   '33ae03902de2a3b2d868fe21aa03f6af4a823f4c'
 )
 'backend\src\modules\logistica-produccion\logistica-produccion.service.js' = @(
   '0aa8595e6b38719904cfff392fe4959c17d6c7d8',
   '16176abe1a13d0361e3edb4ebd1977b8448c0189',
   'b693149959957c1697e3ab3846f329c6cf0a9c76'
 )
 'modules\logistica-produccion\logistica-produccion.js' = @(
   '3d2a7cb5b9cf4bb28a3902d171ffb6fa1377077b',
   'f21e2b3cf1d02b136dcabc3e4bb7e8cbcbe73e42',
   '55343a7ef83465ccd50a9722b4dffacc1dc4cb3c'
 )
 'core\module-loader.js' = @(
   '8a8ab6b1f2660a8c10637849553a8bece740dc0c',
   'f96f08607c70596c538959e7b00f7eb6ba8c31a3',
   '59b548381f36b2942fc0b8d540b761c89e42920e'
 )
 'tests\logistica_produccion_filtro_preproduccion_fase1_v001.test.js' = @('4e99b3400982efd4393566e20deb1461f249ef4a')
 'tests\logistica_produccion_validacion_documental_fase1_v001.test.js' = @(
   '78114b2d2672fea47f9585ee78fb4725a6426524',
   '4cb6fb5d430630a4920ababa85c73a3a981ece84'
 )
 'tests\logistica_produccion_validacion_documental_fase2_v001.test.js' = @(
   '231797a97a906888d61831602ed3a337039f9c60',
   'f6ee677c2eb5d0df95e00de1fe410fb26eff1993'
 )
 'tests\logistica_produccion_fecha_pvo_unica_fase2_v001.test.js' = @(
   'edbf10ef901cb6e84785b6feeed8efc21842b718'
 )
}
$EXPECTED_ZIP = @{
 'backend\src\modules\logistica-produccion\logistica-produccion.repository.js'='33ae03902de2a3b2d868fe21aa03f6af4a823f4c'
 'backend\src\modules\logistica-produccion\logistica-produccion.service.js'='b693149959957c1697e3ab3846f329c6cf0a9c76'
 'modules\logistica-produccion\logistica-produccion.js'='55343a7ef83465ccd50a9722b4dffacc1dc4cb3c'
 'core\module-loader.js'='59b548381f36b2942fc0b8d540b761c89e42920e'
 'tests\logistica_produccion_filtro_preproduccion_fase1_v001.test.js'='4e99b3400982efd4393566e20deb1461f249ef4a'
 'tests\logistica_produccion_validacion_documental_fase1_v001.test.js'='4cb6fb5d430630a4920ababa85c73a3a981ece84'
 'tests\logistica_produccion_validacion_documental_fase2_v001.test.js'='f6ee677c2eb5d0df95e00de1fe410fb26eff1993'
 'tests\logistica_produccion_fecha_pvo_unica_fase2_v001.test.js'='edbf10ef901cb6e84785b6feeed8efc21842b718'
}
$FILES = @($EXPECTED_ZIP.Keys)

# Verificar primero todos los destinos sin modificar nada.
foreach ($f in $FILES) {
  $target = Join-Path $REPO $f
  if (Test-Path -LiteralPath $target) {
    $actual = (git hash-object -- $target).Trim()
    if ($ALLOW[$f] -notcontains $actual) { throw "Archivo local distinto: $f. Integrar manualmente; NO sobrescribir." }
  } elseif (-not $f.StartsWith('tests\')) {
    throw "Falta archivo de runtime: $f"
  }
}

$STAMP = Get-Date -Format 'yyyyMMdd_HHmmss'
$TEMP = Join-Path $env:TEMP "BLTNOW_PVO_F2_$STAMP"
$BACKUP = Join-Path $env:TEMP "BLTNOW_PVO_F2_BACKUP_$STAMP"
New-Item -ItemType Directory -Path $TEMP,$BACKUP -Force | Out-Null
Expand-Archive -LiteralPath $ZIP -DestinationPath $TEMP -Force
foreach ($f in $FILES) {
  $source = Join-Path $TEMP $f
  if (-not (Test-Path -LiteralPath $source)) { throw "El ZIP no contiene: $f" }
  $sha = (git hash-object -- $source).Trim()
  if ($sha -ne $EXPECTED_ZIP[$f]) { throw "Contenido inesperado en ZIP: $f" }
}

$copiados = @()
try {
  foreach ($f in $FILES) {
    $target = Join-Path $REPO $f
    if (Test-Path -LiteralPath $target) {
      $backupFile = Join-Path $BACKUP $f
      New-Item -ItemType Directory -Path (Split-Path -Parent $backupFile) -Force | Out-Null
      Copy-Item -LiteralPath $target -Destination $backupFile -Force
    }
    New-Item -ItemType Directory -Path (Split-Path -Parent $target) -Force | Out-Null
    Copy-Item -LiteralPath (Join-Path $TEMP $f) -Destination $target -Force
    $copiados += $f
  }
  foreach ($f in $FILES) {
    node --check (Join-Path $REPO $f)
    if ($LASTEXITCODE -ne 0) { throw "Error sintactico: $f" }
  }
  $TESTS = @($FILES | Where-Object { $_ -like 'tests\*' } | ForEach-Object { Join-Path $REPO $_ })
  node --test @TESTS
  if ($LASTEXITCODE -ne 0) { throw 'Pruebas fallidas.' }
  git diff --check
  if ($LASTEXITCODE -ne 0) { throw 'git diff --check fallido.' }
  git status --short
  git diff --stat
  Write-Host "FIX listo para revision local. Respaldo: $BACKUP"
} catch {
  foreach ($f in $copiados) {
    $target = Join-Path $REPO $f
    $backupFile = Join-Path $BACKUP $f
    if (Test-Path -LiteralPath $backupFile) { Copy-Item -LiteralPath $backupFile -Destination $target -Force }
    else { Remove-Item -LiteralPath $target -Force -ErrorAction SilentlyContinue }
  }
  throw
}
# Sin git add, commit, push ni deploy automatico.
```

**Estado:** entrega local consolidada; ninguna escritura al repositorio remoto, Aiven, Azure ni Netlify. Antes de publicar, verificar el flujo en Local → GitHub Pages → Netlify por autorización separada.
