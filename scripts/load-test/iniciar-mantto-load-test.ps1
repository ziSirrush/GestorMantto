param(
  [Parameter(Mandatory = $true)]
  [ValidatePattern('^LOAD-[A-Z0-9-]+$')]
  [string]$SessionId,

  [string]$K6Path = 'k6'
)

$ErrorActionPreference = 'Stop'
$TrustedOrigin = 'https://mantto-gestor-api-a4hwfpgvbeb4gmgj.mexicocentral-01.azurewebsites.net'
$ScriptPath = Join-Path $PSScriptRoot 'mantto-gestor-load-test.k6.js'

function ConvertTo-PlainText {
  param([Security.SecureString]$SecureValue)
  return ([System.Net.NetworkCredential]::new('', $SecureValue)).Password
}

function Invoke-ManttoGetJson {
  param(
    [string]$Path,
    [string]$BearerToken
  )

  $headers = @{
    'Accept' = 'application/json'
    'Authorization' = "Bearer $BearerToken"
  }

  $requestArgs = @{
    Uri = ($TrustedOrigin + $Path)
    Headers = $headers
    Method = 'GET'
    MaximumRedirection = 0
    UseBasicParsing = $true
  }
  $response = Invoke-WebRequest @requestArgs

  return ($response.Content | ConvertFrom-Json)
}

if (-not (Get-Command $K6Path -ErrorAction SilentlyContinue)) {
  throw "No se encontro k6 en '$K6Path'. Instala k6 o indica -K6Path con la ruta correcta."
}

if (-not (Test-Path $ScriptPath)) {
  throw "No existe el runner: $ScriptPath"
}

$operatorSecure = Read-Host 'JWT del Programador general propietario de la sesion' -AsSecureString
$testSecure = Read-Host 'JWT de la identidad de prueba de SOLO LECTURA' -AsSecureString
$operatorJwt = ConvertTo-PlainText $operatorSecure
$testJwt = ConvertTo-PlainText $testSecure

if ([string]::IsNullOrWhiteSpace($operatorJwt)) { throw 'El JWT del operador esta vacio.' }
if ([string]::IsNullOrWhiteSpace($testJwt)) { throw 'El JWT de prueba esta vacio.' }
if ($operatorJwt -eq $testJwt) { throw 'La identidad operadora y la identidad funcional de prueba deben ser distintas.' }

$runnerExitCode = 0

try {
  $capabilities = Invoke-ManttoGetJson -Path '/api/panel-control/prueba-carga/capabilities' -BearerToken $operatorJwt
  if (-not $capabilities.ok) { throw 'No se pudieron validar capacidades.' }
  if (-not $capabilities.data.execution_available) {
    throw 'Prueba de Carga no esta habilitada: confirma una sola instancia backend y LOAD_TEST_ALLOWED_ORIGIN.'
  }

  $session = Invoke-ManttoGetJson -Path ("/api/panel-control/prueba-carga/session/" + [uri]::EscapeDataString($SessionId)) -BearerToken $operatorJwt
  if (-not $session.ok) { throw 'No se pudo leer la sesion preparada.' }
  if ($session.data.state -ne 'LISTA') { throw "La sesion debe estar LISTA. Estado actual: $($session.data.state)" }
  if ($session.data.runner_claimed) { throw 'El runner-claim de esta sesion ya fue consumido. Limpia la sesion y prepara una nueva.' }

  $env:MANTTO_LOAD_TEST_SESSION = $SessionId
  $env:MANTTO_OPERATOR_JWT = $operatorJwt
  $env:MANTTO_TEST_JWT = $testJwt
  $env:MANTTO_VUS = [string]$session.data.vus
  $env:MANTTO_DURATION_SECONDS = [string]$session.data.duration_seconds
  $env:MANTTO_SCENARIO = [string]$session.data.scenario
  $env:MANTTO_MIN_VUS = [string]$capabilities.data.limits.min_vus
  $env:MANTTO_MAX_VUS = [string]$capabilities.data.limits.max_vus_configured
  $env:MANTTO_VUS_STEP = [string]$capabilities.data.limits.step_vus

  & $K6Path run $ScriptPath
  $runnerExitCode = if ($null -eq $LASTEXITCODE) { 1 } else { [int]$LASTEXITCODE }
}
finally {
  Remove-Item Env:MANTTO_LOAD_TEST_SESSION -ErrorAction SilentlyContinue
  Remove-Item Env:MANTTO_OPERATOR_JWT -ErrorAction SilentlyContinue
  Remove-Item Env:MANTTO_TEST_JWT -ErrorAction SilentlyContinue
  Remove-Item Env:MANTTO_VUS -ErrorAction SilentlyContinue
  Remove-Item Env:MANTTO_DURATION_SECONDS -ErrorAction SilentlyContinue
  Remove-Item Env:MANTTO_SCENARIO -ErrorAction SilentlyContinue
  Remove-Item Env:MANTTO_MIN_VUS -ErrorAction SilentlyContinue
  Remove-Item Env:MANTTO_MAX_VUS -ErrorAction SilentlyContinue
  Remove-Item Env:MANTTO_VUS_STEP -ErrorAction SilentlyContinue
  $operatorJwt = $null
  $testJwt = $null
  $operatorSecure = $null
  $testSecure = $null
}
if ($runnerExitCode -ne 0) {
  exit $runnerExitCode
}
