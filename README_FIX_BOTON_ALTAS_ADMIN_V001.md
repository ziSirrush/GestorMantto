# BLT NOW | FIX_BOTON_ALTAS_ADMIN_V001 | Instalaciones > Administracion

**Fecha:** 20/10/2026. **Estado:** preparado para aplicar **LOCALMENTE**. No se publico ni modifico GitHub, Aiven, Azure, GitHub Pages o Netlify.

**Fuente revisada:** `ziSirrush/GestorMantto`, `main` commit `0768e330f8e70befd131b89b1d3d4d01940242f9` (Version `102026.5`). **Se revisaron las tres versiones exactas** con sus blobs Git: `module-loader.js` `8ee82edce0e36975637fc39a6a1134094d368c8d`, `service-worker.js` `56ea3eaae1d19c17b714ed4942186c0fb1fbbc3c`, `index.html` `467d69c4e7b149f6ea9201794d8bbdf87ab108ff`.

## Diagnostico y cambio

Los recursos de Fases 2-5 ya estan versionados, pero `core/module-loader.js` **no declara** los dos JS (`altas-formulas_cor.js` y `altas-captura_cor.js`) ni el CSS de captura. El navegador nunca ejecuta `install()` de captura, por lo que **no se crea el boton**. El Service Worker agregado en octubre opera `cache-first` para recursos estaticos y puede conservar el cargador antiguo.

**Este FIX integra SOLAMENTE estos tres archivos compartidos** mediante reemplazos precisos **sobre los archivos completos vigentes en TU checkout**:

- `core/module-loader.js`: incorporar CSS de captura y los JS F3/F4 en orden: motor de formulas -> captura, tras modulo actual (no sustituye al modulo anterior).
- `service-worker.js`: rotar `SERVICE_WORKER_VERSION` para invalidar el shell antiguo.
- `index.html`: rotar el `?v=` del `core/module-loader.js` para que el HTML apunte a la integracion nueva.

**Por que no se incluyen copias ciegas de estos tres archivos centrales en el ZIP:** la constitucion prohíbe sobrescribir cambios concurrentes ajenos. El bloque PowerShell siguiente **LEE el archivo completo del checkout verificado**, realiza tres sustituciones exactas y guarda **archivos completos** solo tras realizar hashes, respaldo y preflight. Se detiene ante otra version; no aplica instalador ni archivo `.patch`. Los recursos F2/F3/F4/F5 ya existen en el repositorio: no se regeneran ni se reemplazan.

## Aplicacion local controlada en PowerShell (sin publicar)

Descargar este ZIP, luego copiar y ejecutar **todo** el bloque, no solamente `Expand-Archive`. Si tu ruta local es distinta, ajustar `$REPO`.

```powershell
$ErrorActionPreference = 'Stop'
$REPO = 'C:\Users\T14s\Downloads\mantto_gestor_frontend'
$ZIP = Join-Path $env:USERPROFILE 'Downloads\FIX_BLTNOW_BOTON_ALTAS_ADMIN_V001.zip'
Set-Location $REPO
if (-not (Test-Path -LiteralPath $ZIP)) { throw 'No se encontro el ZIP.' }
git status --short

# Preflight: el codigo central debe seguir exactamente en la base examinada.
$expected = @{
 'core/module-loader.js' = '8ee82edce0e36975637fc39a6a1134094d368c8d'
 'service-worker.js' = '56ea3eaae1d19c17b714ed4942186c0fb1fbbc3c'
 'index.html' = '467d69c4e7b149f6ea9201794d8bbdf87ab108ff'
}
foreach ($p in $expected.Keys) {
 if (-not (Test-Path -LiteralPath $p)) { throw "Falta archivo base: $p" }
 $actual = (& git hash-object -- $p).Trim()
 if ($LASTEXITCODE -ne 0 -or $actual -ne $expected[$p]) {
   throw "VERSION DIFERENTE en $p. Detener y conciliar, no sobrescribir."
 }
}
$module = 'modules/instalaciones-administracion'
foreach ($p in @(
 "$module/instalaciones-administracion-altas-captura_cor.css",
 "$module/instalaciones-administracion-altas-captura_cor.js",
 "$module/instalaciones-administracion-altas-formulas_cor.js"
)) { if (-not (Test-Path -LiteralPath $p)) { throw "Falta Fase 2/3/4: $p" } }

$stage = Join-Path $env:TEMP ('BLTNOW_FIX_BTN_STAGING_' + [guid]::NewGuid().ToString('N'))
Expand-Archive -LiteralPath $ZIP -DestinationPath $stage -ErrorAction Stop
$testRel = 'tests/instalaciones-administracion-fix-boton-altas.test.js'
if (-not (Test-Path -LiteralPath (Join-Path $stage $testRel))) { throw 'ZIP incompleto: falta QA.' }
if (Test-Path -LiteralPath $testRel) { throw 'QA ya existe: detener y conciliar.' }

$loaderPath = (Resolve-Path -LiteralPath 'core/module-loader.js').Path
$swPath = (Resolve-Path -LiteralPath 'service-worker.js').Path
$indexPath = (Resolve-Path -LiteralPath 'index.html').Path
$loader = [System.IO.File]::ReadAllText($loaderPath)
$sw = [System.IO.File]::ReadAllText($swPath)
$index = [System.IO.File]::ReadAllText($indexPath)

$oldJs = "'./modules/instalaciones-administracion/instalaciones-administracion_cor.js?v=20261013-integral-fix-v001'"
$oldCss = "'./modules/instalaciones-administracion/instalaciones-administracion-ghost_cor.css?v=20261013-integral-fix-v001'"
$newFormula = "'./modules/instalaciones-administracion/instalaciones-administracion-altas-formulas_cor.js?v=20261020-fix-altas-admin-v001'"
$newCapture = "'./modules/instalaciones-administracion/instalaciones-administracion-altas-captura_cor.js?v=20261020-fix-altas-admin-v001'"
$newCss = "'./modules/instalaciones-administracion/instalaciones-administracion-altas-captura_cor.css?v=20261020-fix-altas-admin-v001'"
$swOld = "const SERVICE_WORKER_VERSION = '20261020-offline-shell-v001';"
$swNew = "const SERVICE_WORKER_VERSION = '20261020-fix-altas-admin-v001';"
$indexOld = '<script src="./core/module-loader.js?v=20261020-offline-piloto-f1-v001"></script>'
$indexNew = '<script src="./core/module-loader.js?v=20261020-fix-altas-admin-v001"></script>'

foreach ($entry in @(
 @{ text=$loader; value=$oldJs }, @{ text=$loader; value=$oldCss },
 @{ text=$sw; value=$swOld }, @{ text=$index; value=$indexOld }
)) {
 if ([regex]::Matches($entry.text, [regex]::Escape($entry.value)).Count -ne 1) {
   throw 'Ancla ausente o duplicada en archivo central: no modificar.'
 }
}
if ($loader.Contains($newFormula) -or $loader.Contains($newCapture) -or
    $loader.Contains($newCss) -or $sw.Contains($swNew) -or $index.Contains($indexNew)) {
 throw 'Integracion ya aplicada o parcial: no duplicar.'
}
$updatedLoader = $loader.Replace($oldJs, ($oldJs + ',' + $newFormula + ',' + $newCapture)).Replace($oldCss, ($oldCss + ',' + $newCss))
$updatedSw = $sw.Replace($swOld, $swNew)
$updatedIndex = $index.Replace($indexOld, $indexNew)

# Respaldo de archivos COMPLETOS antes de escribir. No usar git reset --hard.
$backup = Join-Path $env:TEMP ('BLTNOW_FIX_BTN_BACKUP_' + (Get-Date -Format 'yyyyMMdd_HHmmss'))
foreach ($p in $expected.Keys) {
 $dest = Join-Path $backup $p
 New-Item -ItemType Directory -Force -Path (Split-Path -Parent $dest) | Out-Null
 Copy-Item -LiteralPath $p -Destination $dest -ErrorAction Stop
}
Write-Host "Respaldo local: $backup"
$enc = [System.Text.UTF8Encoding]::new($false)
try {
 [System.IO.File]::WriteAllText($loaderPath, $updatedLoader, $enc)
 [System.IO.File]::WriteAllText($swPath, $updatedSw, $enc)
 [System.IO.File]::WriteAllText($indexPath, $updatedIndex, $enc)
 Copy-Item -LiteralPath (Join-Path $stage $testRel) -Destination $testRel -ErrorAction Stop
 foreach ($p in @('core/module-loader.js','service-worker.js', $testRel)) {
   & node --check $p
   if ($LASTEXITCODE -ne 0) { throw "Error de sintaxis: $p" }
 }
 & node --test $testRel
 if ($LASTEXITCODE -ne 0) { throw 'QA de integracion fallo.' }
 git diff --check
 if ($LASTEXITCODE -ne 0) { throw 'git diff --check fallo.' }
} catch {
 foreach ($p in $expected.Keys) { Copy-Item -LiteralPath (Join-Path $backup $p) -Destination $p -Force }
 if (Test-Path -LiteralPath $testRel) { Remove-Item -LiteralPath $testRel -Force }
 throw
}
Write-Host 'FIX aplicado LOCALMENTE y comprobado. NO publicado.'
git status --short
git diff --stat
```

## QA y publicacion

- **Verificado en GitHub:** el `main` revisado contenia ya los tres recursos F2/F3/F4, pero NO estaban declarados en `module-loader.js`.
- **Validado localmente al empaquetar:** sintaxis del test Node; simulacion de registro, orden y version de cache con archivos de muestra. NO se ha aplicado el FIX en el checkout del usuario.
- **Se validara al ejecutar el bloque:** `node --check`, `node --test` del test incorporado, `git diff --check` y hashes exactos del origen.
- **Pendiente:** validacion visual con usuario autorizado `INSTALACIONES_ADMINISTRACION_ACCESO_VISUAL_MODULO.EDITAR`, prueba sin EDITAR, modo Visor, PWA/Service Worker, API real, GitHub Pages, Azure/Aiven. La integracion NO elimina la necesidad de Fase 5 E2E con BD restaurada.
- Para ver el boton en Pages, aplicar el fix, validar en Local, hacer **commit y push solo con autorizacion**, permitir despliegue de Pages y volver a abrir/actualizar las pestañas de BLT NOW. **Netlify no se actualiza automaticamente**.

## Reversion

Recuperar los tres archivos completos desde `$backup` y eliminar unicamente `tests/instalaciones-administracion-fix-boton-altas.test.js` si no se altero despues. No borrar caches ni datos operativos. Ninguna migracion SQL ni actualizacion de backend forman parte de este FIX.
