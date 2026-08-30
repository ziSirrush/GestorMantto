param(
  [Parameter(Mandatory = $false)]
  [string]$RepoPath = "."
)

$ErrorActionPreference = "Stop"

function Write-Utf8NoBom {
  param([string]$Path, [string]$Content)
  $utf8 = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($Path, $Content, $utf8)
}

function Require-File {
  param([string]$Path)
  if (-not (Test-Path -LiteralPath $Path)) {
    throw "No se encontro el archivo requerido: $Path"
  }
}

$phaseRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = (Resolve-Path -LiteralPath $RepoPath).Path

$indexPath = Join-Path $repoRoot "index.html"
$loaderPath = Join-Path $repoRoot "core/module-loader.js"
$dashboardJsPath = Join-Path $repoRoot "modules/ventas-dashboard/ventas-dashboard.js"
$dashboardHtmlPath = Join-Path $repoRoot "modules/ventas-dashboard/ventas-dashboard.html"
$dashboardCssPath = Join-Path $repoRoot "modules/ventas-dashboard/ventas-dashboard.css"
$responsiveCssPath = Join-Path $repoRoot "styles/responsive-contract.css"

Require-File $indexPath
Require-File $loaderPath
Require-File $dashboardJsPath

$payloadHtml = Join-Path $phaseRoot "modules/ventas-dashboard/ventas-dashboard.html"
$payloadCss = Join-Path $phaseRoot "modules/ventas-dashboard/ventas-dashboard.css"
$payloadResponsive = Join-Path $phaseRoot "styles/responsive-contract.css"
Require-File $payloadHtml
Require-File $payloadCss
Require-File $payloadResponsive

New-Item -ItemType Directory -Force -Path (Split-Path -Parent $dashboardHtmlPath) | Out-Null
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $responsiveCssPath) | Out-Null
Copy-Item -LiteralPath $payloadHtml -Destination $dashboardHtmlPath -Force
Copy-Item -LiteralPath $payloadCss -Destination $dashboardCssPath -Force
Copy-Item -LiteralPath $payloadResponsive -Destination $responsiveCssPath -Force

# 1) Cargar el contrato responsive global inmediatamente despues de base.css.
$index = Get-Content -LiteralPath $indexPath -Raw
$newResponsiveLink = '<link href="./styles/responsive-contract.css?v=20260831-fase1-responsive-global-v001" rel="stylesheet"/>'
if ($index -notmatch [regex]::Escape('styles/responsive-contract.css')) {
  $basePattern = '(<link\s+href="\./styles/base\.css\?v=[^"]+"\s+rel="stylesheet"\s*/>)'
  if ($index -notmatch $basePattern) {
    throw "No se encontro el enlace actual de styles/base.css en index.html. No se modifico el index."
  }
  $index = [regex]::Replace($index, $basePattern, ('$1' + "`r`n" + $newResponsiveLink), 1)
  Write-Utf8NoBom -Path $indexPath -Content $index
}

# 2) Forzar que Dashboard Ventas solicite la plantilla HTML nueva.
$dashboardJs = Get-Content -LiteralPath $dashboardJsPath -Raw
$oldTemplate = "const TEMPLATE_VERSION = '20260830-fase2-cierre-optimizacion-v001';"
$newTemplate = "const TEMPLATE_VERSION = '20260831-fase1-responsive-global-v001';"
if ($dashboardJs.Contains($newTemplate)) {
  # Ya aplicado.
} elseif ($dashboardJs.Contains($oldTemplate)) {
  $dashboardJs = $dashboardJs.Replace($oldTemplate, $newTemplate)
  Write-Utf8NoBom -Path $dashboardJsPath -Content $dashboardJs
} else {
  throw "No se encontro la version de plantilla esperada en ventas-dashboard.js. Revisar merge antes de continuar."
}

# 3) Cache-bust del CSS y JS de Dashboard Ventas en el module-loader.
$loader = Get-Content -LiteralPath $loaderPath -Raw
$oldCss = './modules/ventas-dashboard/ventas-dashboard.css?v=20260830-fase2-cierre-optimizacion-v001'
$newCss = './modules/ventas-dashboard/ventas-dashboard.css?v=20260831-fase1-responsive-global-v001'
$oldJs = './modules/ventas-dashboard/ventas-dashboard.js?v=20260830-fase2-cierre-optimizacion-v001'
$newJs = './modules/ventas-dashboard/ventas-dashboard.js?v=20260831-fase1-responsive-global-v001'

if ($loader.Contains($oldCss)) {
  $loader = $loader.Replace($oldCss, $newCss)
} elseif (-not $loader.Contains($newCss)) {
  throw "No se encontro el cache-bust esperado de ventas-dashboard.css en module-loader.js."
}

if ($loader.Contains($oldJs)) {
  $loader = $loader.Replace($oldJs, $newJs)
} elseif (-not $loader.Contains($newJs)) {
  throw "No se encontro el cache-bust esperado de ventas-dashboard.js en module-loader.js."
}

Write-Utf8NoBom -Path $loaderPath -Content $loader

Write-Host "FASE 1 RESPONSIVE GLOBAL aplicada localmente." -ForegroundColor Green
Write-Host "- Contrato global cargado desde styles/responsive-contract.css"
Write-Host "- PDF Dashboard Ventas regresado al encabezado"
Write-Host "- Cache-bust Dashboard actualizado"
Write-Host "- Sin SQL / sin backend / sin cambios de datos"
