param(
  [Parameter(Mandatory=$true)]
  [string]$ApiBase,
  [Parameter(Mandatory=$true)]
  [string]$Token
)

$ErrorActionPreference = 'Stop'
$Base = $ApiBase.TrimEnd('/')
$Headers = @{ Authorization = "Bearer $Token"; Accept = 'application/json' }
$Endpoints = @(
  '/api/entregas/opciones',
  '/api/entregas/programadas',
  '/api/entregas/mis-entregas',
  '/api/entregas/validacion',
  '/api/entregas/indicadores'
)

$Failed = $false
Write-Host '=== FASE 2 ENTREGAS | SMOKE API SOLO LECTURA ==='
Write-Host "API: $Base"
Write-Host 'El token NO se imprime.'

foreach ($Endpoint in $Endpoints) {
  $Uri = "$Base$Endpoint"
  try {
    $Response = Invoke-WebRequest -Uri $Uri -Headers $Headers -Method GET -UseBasicParsing
    $Status = [int]$Response.StatusCode
    $Json = $null
    try { $Json = $Response.Content | ConvertFrom-Json } catch {}
    $Ok = ($Status -eq 200 -and $null -ne $Json -and $Json.ok -eq $true)
    if ($Ok) {
      Write-Host "PASS $Status $Endpoint"
    } else {
      Write-Host "FAIL $Status $Endpoint"
      $Failed = $true
    }
  }
  catch {
    $Status = $null
    try { $Status = [int]$_.Exception.Response.StatusCode.value__ } catch {}
    if ($Status) { Write-Host "FAIL $Status $Endpoint" }
    else { Write-Host "FAIL N/D $Endpoint | $($_.Exception.Message)" }
    $Failed = $true
  }
}

if ($Failed) { throw 'Uno o mas endpoints de lectura no pasaron el smoke.' }
Write-Host ''
Write-Host 'SMOKE API SOLO LECTURA: PASS'
Write-Host 'Este smoke NO carga archivos ni crea/desactiva/valida registros.'
