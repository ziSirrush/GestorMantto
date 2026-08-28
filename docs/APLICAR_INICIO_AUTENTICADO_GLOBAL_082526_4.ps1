param(
  [Parameter(Mandatory=$false)]
  [string]$RepoPath = (Get-Location).Path
)

$ErrorActionPreference = 'Stop'

function Fail([string]$Message) {
  Write-Host "ERROR: $Message" -ForegroundColor Red
  exit 1
}

$RepoPath = (Resolve-Path $RepoPath).Path
$RouterPath = Join-Path $RepoPath 'core\router.js'
$BuildInfoPath = Join-Path $RepoPath 'core\build-info.js'
$IndexPath = Join-Path $RepoPath 'index.html'
$FixBuildInfoPath = Join-Path $PSScriptRoot 'core\build-info.js'

if (-not (Test-Path $RouterPath)) { Fail "No existe $RouterPath" }
if (-not (Test-Path $BuildInfoPath)) { Fail "No existe $BuildInfoPath" }
if (-not (Test-Path $IndexPath)) { Fail "No existe $IndexPath" }
if (-not (Test-Path $FixBuildInfoPath)) { Fail "No existe $FixBuildInfoPath" }

Write-Host 'Aplicando Inicio Autenticado Global 082526.4...' -ForegroundColor Cyan

# 1) Router: eliminar la carrera fija de 800 ms.
$router = Get-Content -Raw -Encoding UTF8 $RouterPath
$oldRouterBlock = @"
  document.addEventListener('DOMContentLoaded', function(){
    if(!window.ManttoAuth) window.setTimeout(restoreInitialRoute, 0);
    else window.setTimeout(function(){ if(!initialRouteRestored) restoreInitialRoute(); }, 800);
  });
  document.addEventListener('mantto:auth-ready', restoreInitialRoute);
"@
$newRouterBlock = @"
  document.addEventListener('DOMContentLoaded', function(){
    // Si Auth existe, toda ruta protegida debe esperar la confirmación real
    // mantto:auth-ready. Se elimina el fallback fijo de 800 ms porque puede
    // abrir módulos protegidos antes de que el JWT haya sido restaurado/renovado.
    if(!window.ManttoAuth) window.setTimeout(restoreInitialRoute, 0);
  });
  document.addEventListener('mantto:auth-ready', restoreInitialRoute);
"@

if ($router.Contains($oldRouterBlock)) {
  $router = $router.Replace($oldRouterBlock, $newRouterBlock)
  Set-Content -Path $RouterPath -Value $router -Encoding UTF8 -NoNewline
  Write-Host 'OK core/router.js: restauración inicial espera mantto:auth-ready.' -ForegroundColor Green
} elseif ($router.Contains("if(!window.ManttoAuth) window.setTimeout(restoreInitialRoute, 0);") -and -not $router.Contains('}, 800);')) {
  Write-Host 'AVISO core/router.js: el cambio parece estar aplicado; no se reemplazó de nuevo.' -ForegroundColor Yellow
} else {
  Fail 'No se encontró el bloque esperado de restauración inicial en core/router.js. No se modificó para evitar un parche incorrecto.'
}

# 2) Build info: reemplazo completo del archivo verificado para mostrar solo el mensaje en Login.
Copy-Item -Force $FixBuildInfoPath $BuildInfoPath
Write-Host 'OK core/build-info.js: versión de Login habilitada.' -ForegroundColor Green

# 3) Cache-busting en index.html sin reemplazar el archivo completo, para conservar 082526.2 y 082526.3.
$index = Get-Content -Raw -Encoding UTF8 $IndexPath
$before = $index
$index = [regex]::Replace(
  $index,
  '(?<prefix><script\s+src="\./core/build-info\.js)\?v=[^"]+(?<suffix>"></script>)',
  '${prefix}?v=20260825-login-version-v004${suffix}'
)
$index = [regex]::Replace(
  $index,
  '(?<prefix><script\s+src="\./core/router\.js)\?v=[^"]+(?<suffix>"></script>)',
  '${prefix}?v=20260825-auth-route-v004${suffix}'
)

if ($index -eq $before) {
  Fail 'No fue posible actualizar los cache-busting de build-info.js/router.js en index.html.'
}
Set-Content -Path $IndexPath -Value $index -Encoding UTF8 -NoNewline
Write-Host 'OK index.html: cache-busting actualizado sin sobrescribir otros cambios.' -ForegroundColor Green

# 4) Validaciones básicas.
$node = Get-Command node -ErrorAction SilentlyContinue
if ($node) {
  & node --check $BuildInfoPath
  if ($LASTEXITCODE -ne 0) { Fail 'node --check falló para core/build-info.js' }
  & node --check $RouterPath
  if ($LASTEXITCODE -ne 0) { Fail 'node --check falló para core/router.js' }
  Write-Host 'OK node --check: build-info.js y router.js.' -ForegroundColor Green
} else {
  Write-Host 'AVISO: Node.js no está disponible; se omitió node --check.' -ForegroundColor Yellow
}

Write-Host ''
Write-Host 'FIX aplicado. Revisa antes de commit:' -ForegroundColor Cyan
Write-Host '  git diff -- core/router.js core/build-info.js index.html'
Write-Host '  git status'
