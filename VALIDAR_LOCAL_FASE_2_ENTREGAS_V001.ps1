param(
  [Parameter(Mandatory=$true)]
  [string]$Repo,
  [switch]$SkipBackendProjectCheck
)

$ErrorActionPreference = 'Stop'
$Tool = Join-Path $PSScriptRoot 'tools\entregas-fase2-contract.cjs'

if (-not (Test-Path $Repo)) { throw "No existe el repositorio: $Repo" }
if (-not (Test-Path $Tool)) { throw "No existe el validador: $Tool" }

Set-Location $Repo

Write-Host '=== FASE 2 ENTREGAS | VALIDACION LOCAL ==='
Write-Host "Repo: $Repo"
Write-Host "Commit actual: $((git rev-parse HEAD).Trim())"

node $Tool $Repo
if ($LASTEXITCODE -ne 0) { throw 'Fallo el contrato local de Entregas.' }

git diff --check
if ($LASTEXITCODE -ne 0) { throw 'git diff --check detecto problemas.' }
Write-Host 'PASS git diff --check'

if (-not $SkipBackendProjectCheck) {
  $Backend = Join-Path $Repo 'backend'
  if (Test-Path (Join-Path $Backend 'package.json')) {
    Push-Location $Backend
    try {
      npm run check
      if ($LASTEXITCODE -ne 0) { throw 'npm run check fallo.' }
      Write-Host 'PASS backend npm run check'
    }
    finally { Pop-Location }
  }
}

Write-Host ''
Write-Host 'VALIDACION LOCAL: PASS'
Write-Host 'Esto NO valida Aiven real, Azure Blob real ni navegador E2E.'
Write-Host 'No se modifico el repositorio.'
