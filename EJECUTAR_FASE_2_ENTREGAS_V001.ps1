param(
  [Parameter(Mandatory=$true)]
  [string]$Repo,
  [string]$ApiBase = '',
  [string]$Token = '',
  [switch]$SkipBackendProjectCheck
)

$ErrorActionPreference = 'Stop'
$Local = Join-Path $PSScriptRoot 'VALIDAR_LOCAL_FASE_2_ENTREGAS_V001.ps1'
$Api = Join-Path $PSScriptRoot 'VALIDAR_API_LECTURA_FASE_2_ENTREGAS_V001.ps1'

& $Local -Repo $Repo -SkipBackendProjectCheck:$SkipBackendProjectCheck
if ($LASTEXITCODE -ne 0) { throw 'La validacion local no paso.' }

if ($ApiBase -and $Token) {
  & $Api -ApiBase $ApiBase -Token $Token
  if ($LASTEXITCODE -ne 0) { throw 'El smoke API no paso.' }
} else {
  Write-Host ''
  Write-Host 'API real: PENDIENTE (no se proporcionaron ApiBase + Token).'
}

Write-Host ''
Write-Host 'Siguiente paso obligatorio para cerrar:'
Write-Host '1) Ejecutar VALIDAR_AIVEN_FASE_2_ENTREGAS_V001.sql en Aiven objetivo.'
Write-Host '2) Ejecutar CHECKLIST_E2E_AZURE_FASE_2_ENTREGAS_V001.md en Pruebas.'
Write-Host '3) Registrar resultados en RESULTADO_CIERRE_FASE_2_ENTREGAS_V001.md.'
Write-Host ''
Write-Host 'Este script no modifica GitHub, Aiven, Azure ni Netlify.'
