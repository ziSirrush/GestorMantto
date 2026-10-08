# [Aster | 2026-10-08 | ASTER-MG | FASE_4_INSTALACIONES_ADMINISTRACION_FORMULARIOS_GUARDADO_V001]
# Run only after extracting the complete files over the local repository root.
# Never performs Git push, database writes, Azure deployment or Netlify deployment.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$loaderPath = Join-Path $root 'core\module-loader.js'
$indexPath = Join-Path $root 'index.html'
$phase3 = '20261008-instalaciones-administracion-fase3-v001'
$phase4 = '20261008-instalaciones-administracion-fase4-v001'

if (!(Test-Path $loaderPath) -or !(Test-Path $indexPath)) {
    throw 'Estructura incorrecta. Extrae el ZIP en la raiz del repositorio GestorMantto.'
}
$utf8 = New-Object System.Text.UTF8Encoding($false)
$loader = [System.IO.File]::ReadAllText($loaderPath, [System.Text.Encoding]::UTF8)
$index = [System.IO.File]::ReadAllText($indexPath, [System.Text.Encoding]::UTF8)

$oldJs = 'instalaciones-administracion_cor.js?v=' + $phase3
$newJs = 'instalaciones-administracion_cor.js?v=' + $phase4
$oldIndex = 'core/module-loader.js?v=' + $phase3
$newIndex = 'core/module-loader.js?v=' + $phase4

if (!$loader.Contains($oldJs) -and !$loader.Contains($newJs)) {
    throw 'No coincide module-loader.js con la base aprobada. No se modifico ningun archivo.'
}
if (!$index.Contains($oldIndex) -and !$index.Contains($newIndex)) {
    throw 'No coincide index.html con la base aprobada. No se modifico ningun archivo.'
}
if ($loader.Contains($oldJs)) { $loader = $loader.Replace($oldJs, $newJs) }
if ($index.Contains($oldIndex)) { $index = $index.Replace($oldIndex, $newIndex) }

# Both prechecks finished before writing anything. Idempotent on repeated runs.
[System.IO.File]::WriteAllText($loaderPath, $loader, $utf8)
[System.IO.File]::WriteAllText($indexPath, $index, $utf8)
Write-Host 'FASE 4: cache bust aplicado localmente (idempotente).' -ForegroundColor Green
Write-Host 'Revisar: git diff --check; git diff -- core/module-loader.js index.html'
