$ErrorActionPreference = 'Stop'

$root = (Get-Location).Path
$indexPath = Join-Path $root 'index.html'
$sourceEstados = Join-Path $PSScriptRoot 'core\estados-visuales.js'
$targetEstados = Join-Path $root 'core\estados-visuales.js'

if (-not (Test-Path $indexPath)) {
  throw "No se encontro index.html. Ejecuta este script desde la raiz de GestorMantto."
}
if (-not (Test-Path $targetEstados)) {
  throw "No se encontro core\estados-visuales.js en el proyecto destino."
}
if (-not (Test-Path $sourceEstados)) {
  throw "No se encontro el archivo del FIX: core\estados-visuales.js."
}

$index = [System.IO.File]::ReadAllText($indexPath)

$oldConfig = './core/config.js?v=20260705-v114'
$newConfig = './core/config.js?v=20260825-netlify-auth-v001'
$oldEstados = './core/estados-visuales.js?v=20260723-v031-2a'
$newEstados = './core/estados-visuales.js?v=20260825-inicio-autenticado-v001'

if (-not $index.Contains($oldConfig) -and -not $index.Contains($newConfig)) {
  throw "index.html no contiene la referencia esperada de core/config.js. No se modifico nada."
}
if (-not $index.Contains($oldEstados) -and -not $index.Contains($newEstados)) {
  throw "index.html no contiene la referencia esperada de core/estados-visuales.js. No se modifico nada."
}

$index = $index.Replace($oldConfig, $newConfig)
$index = $index.Replace($oldEstados, $newEstados)

Copy-Item -LiteralPath $sourceEstados -Destination $targetEstados -Force
[System.IO.File]::WriteAllText($indexPath, $index, (New-Object System.Text.UTF8Encoding($false)))

Write-Host 'FIX Inicio Autenticado 082526.2 aplicado.' -ForegroundColor Green
Write-Host 'Modificados:'
Write-Host ' - core\estados-visuales.js'
Write-Host ' - index.html (solo cache-busting de config.js y estados-visuales.js)'
Write-Host ''
Write-Host 'Siguiente validacion recomendada:'
Write-Host '  node --check core/estados-visuales.js'
Write-Host '  git diff -- core/estados-visuales.js index.html'
