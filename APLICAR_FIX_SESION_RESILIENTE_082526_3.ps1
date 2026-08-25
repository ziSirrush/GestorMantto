param(
  [string]$RepoRoot = (Get-Location).Path
)

$ErrorActionPreference = 'Stop'

$FixRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$SourceAuth = Join-Path $FixRoot 'core\auth.js'
$TargetAuth = Join-Path $RepoRoot 'core\auth.js'
$TargetIndex = Join-Path $RepoRoot 'index.html'

if (-not (Test-Path $SourceAuth)) {
  throw "No se encontro el archivo del FIX: $SourceAuth"
}
if (-not (Test-Path $TargetAuth)) {
  throw "No se encontro core/auth.js en el repo: $TargetAuth"
}
if (-not (Test-Path $TargetIndex)) {
  throw "No se encontro index.html en el repo: $TargetIndex"
}

Copy-Item -LiteralPath $SourceAuth -Destination $TargetAuth -Force

$OldAuthRef = '<script src="./core/auth.js?v=20260824-session-90d-12h-v002"></script>'
$NewAuthRef = '<script src="./core/auth.js?v=20260825-sesion-resiliente-v003"></script>'

$IndexText = [System.IO.File]::ReadAllText($TargetIndex)
if (-not $IndexText.Contains($OldAuthRef)) {
  if (-not $IndexText.Contains($NewAuthRef)) {
    throw "No se encontro la referencia esperada de core/auth.js en index.html. No se modifico el cache-busting."
  }
} else {
  $IndexText = $IndexText.Replace($OldAuthRef, $NewAuthRef)
  $Utf8NoBom = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($TargetIndex, $IndexText, $Utf8NoBom)
}

Write-Host 'FIX SESION RESILIENTE 082526.3 aplicado.' -ForegroundColor Green
Write-Host 'Archivos afectados:'
Write-Host '  core/auth.js'
Write-Host '  index.html (solo cache-busting de auth.js)'
Write-Host ''
Write-Host 'Este script NO hace git add, commit, push ni deploy de Netlify.' -ForegroundColor Yellow
