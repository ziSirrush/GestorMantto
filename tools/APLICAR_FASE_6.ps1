param(
  [Parameter(Mandatory=$false)]
  [string]$RepoRoot = "."
)

$ErrorActionPreference = "Stop"
$PackageRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot = (Resolve-Path $RepoRoot).Path
$Utf8NoBom = New-Object System.Text.UTF8Encoding($false)

function Read-Utf8([string]$Path) {
  return [System.IO.File]::ReadAllText($Path)
}

function Write-Utf8([string]$Path, [string]$Content) {
  [System.IO.File]::WriteAllText($Path, $Content, $Utf8NoBom)
}

function Replace-Once([string]$Content, [string]$Old, [string]$New, [string]$Label) {
  $first = $Content.IndexOf($Old, [System.StringComparison]::Ordinal)
  if ($first -lt 0) { throw "No se encontro el ancla requerida: $Label" }
  $second = $Content.IndexOf($Old, $first + $Old.Length, [System.StringComparison]::Ordinal)
  if ($second -ge 0) { throw "El ancla no es unica: $Label" }
  return $Content.Substring(0, $first) + $New + $Content.Substring($first + $Old.Length)
}

$required = @(
  "core/router.js",
  "core/module-loader.js",
  "index.html",
  "backend/src/modules/ventas-cotizaciones/ventas-cotizaciones.routes.js"
)
foreach ($relative in $required) {
  $target = Join-Path $RepoRoot $relative
  if (-not (Test-Path $target)) { throw "No existe en el repo: $relative" }
}

$routerPath = Join-Path $RepoRoot "core/router.js"
$indexPath = Join-Path $RepoRoot "index.html"
$router = Read-Utf8 $routerPath
$index = Read-Utf8 $indexPath
$routerNl = if ($router.Contains("`r`n")) { "`r`n" } else { "`n" }
$indexNl = if ($index.Contains("`r`n")) { "`r`n" } else { "`n" }

if ($router -notmatch "ventas-proyectos-interes") {
  $router = Replace-Once $router `
    "    'ventas-dashboard':'Dashboard Ventas', 'ventas-vendidos':'Vendidos', 'ventas-proyeccion':'Proyección', 'ventas-perdidos':'Perdidos'," `
    "    'ventas-dashboard':'Dashboard Ventas', 'ventas-vendidos':'Vendidos', 'ventas-proyeccion':'Proyección', 'ventas-proyectos-interes':'Proyectos de interés', 'ventas-perdidos':'Perdidos'," `
    "router.routeNames Ventas"

  $interestFunction = @(
    "  function showVentasProyectosInteres(){",
    "    const view=document.getElementById('view-ventas-proyectos-interes');",
    "    if(!view) return false;",
    "    activateViewById('view-ventas-proyectos-interes');",
    "    setActiveSide('ventas-proyectos-interes');",
    "    updateContext('ventas-proyectos-interes','Proyectos de interés · lista personal de cotizaciones marcadas');",
    "    if(window.ManttoVentasProyectosInteres) window.ManttoVentasProyectosInteres.init();",
    "    return true;",
    "  }",
    ""
  ) -join $routerNl
  $interestFunction += $routerNl
  $router = Replace-Once $router `
    "  function showVentasPerdidos(){" `
    ($interestFunction + "  function showVentasPerdidos(){") `
    "router.before showVentasPerdidos"

  $router = Replace-Once $router `
    "    if(route==='ventas-proyeccion' && showVentasProyeccion()) return;" `
    ("    if(route==='ventas-proyeccion' && showVentasProyeccion()) return;" + $routerNl + "    if(route==='ventas-proyectos-interes' && showVentasProyectosInteres()) return;") `
    "router.showPlaceholder ventas-proyeccion"
}

if ($index -notmatch 'data-route="ventas-proyectos-interes"') {
  $oldButton = '<button class="side-item" data-permission="ventas_proyeccion" data-route="ventas-proyeccion" type="button"><span>📈</span><b>Proyección</b></button>'
  $newButton = '<button class="side-item" data-permission="ventas_cotizaciones" data-route="ventas-proyectos-interes" type="button"><span>⭐</span><b>Proyectos de interés</b></button>'
  $index = Replace-Once $index $oldButton ($oldButton + $indexNl + $newButton) "index.sidebar Proyección"

  $oldView = '<section aria-label="Proyección" class="view" data-view="ventas-proyeccion" id="view-ventas-proyeccion"></section>'
  $newView = '<section aria-label="Proyectos de interés" class="view" data-view="ventas-proyectos-interes" id="view-ventas-proyectos-interes"></section>'
  $index = Replace-Once $index $oldView ($oldView + $indexNl + $newView) "index.view Proyección"
}

# Solo despues de validar las anclas se escriben los archivos core.
Write-Utf8 $routerPath $router
Write-Utf8 $indexPath $index

$copyFiles = @(
  "core/module-loader.js",
  "backend/src/modules/ventas-cotizaciones/ventas-cotizaciones-interes.repository.js",
  "backend/src/modules/ventas-cotizaciones/ventas-cotizaciones-interes.service.js",
  "backend/src/modules/ventas-cotizaciones/ventas-cotizaciones-interes.controller.js",
  "backend/src/modules/ventas-cotizaciones/ventas-cotizaciones.routes.js",
  "modules/ventas-proyectos-interes/ventas-proyectos-interes.html",
  "modules/ventas-proyectos-interes/ventas-proyectos-interes.css",
  "modules/ventas-proyectos-interes/ventas-proyectos-interes.js"
)

foreach ($relative in $copyFiles) {
  $source = Join-Path $PackageRoot $relative
  $target = Join-Path $RepoRoot $relative
  if (-not (Test-Path $source)) { throw "Falta archivo en paquete: $relative" }
  $targetDir = Split-Path -Parent $target
  if (-not (Test-Path $targetDir)) { New-Item -ItemType Directory -Force -Path $targetDir | Out-Null }
  Copy-Item -Force $source $target
}

Write-Host "Fase 6 aplicada localmente al repo: $RepoRoot" -ForegroundColor Green
Write-Host "No se ejecuto commit, push, deploy ni SQL." -ForegroundColor Yellow
