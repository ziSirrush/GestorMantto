param(
  [Parameter(Mandatory = $true)]
  [ValidatePattern('^LOAD-[A-Z0-9-]+$')]
  [string]$SessionId
)

$ErrorActionPreference = 'Stop'
$ServicePath = Join-Path $PSScriptRoot 'mantto-load-test-runner.service.js'
$K6Path = if ($env:MANTTO_K6_PATH) { $env:MANTTO_K6_PATH } else { 'k6' }

if (-not $env:MANTTO_RUNNER_SERVICE_TOKEN -or
    -not $env:MANTTO_TEST_EMAIL -or
    -not $env:MANTTO_TEST_PASSWORD -or
    -not (Get-Command node -ErrorAction SilentlyContinue) -or
    -not (Get-Command $K6Path -ErrorAction SilentlyContinue)) {
  throw 'Este equipo no esta provisionado como runner de Prueba de Carga. Usa el modulo desde una PC autorizada; la ejecucion sera atendida por el runner central.'
}

& node $ServicePath --session-id $SessionId
exit $LASTEXITCODE
