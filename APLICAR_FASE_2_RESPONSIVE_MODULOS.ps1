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
$responsiveCssPath = Join-Path $repoRoot "styles/responsive-contract.css"
$payloadResponsive = Join-Path $phaseRoot "styles/responsive-contract.css"
$loaderSnippetPath = Join-Path $phaseRoot "patches/module-loader-style-isolation.js"

Require-File $indexPath
Require-File $loaderPath
Require-File $payloadResponsive
Require-File $loaderSnippetPath

# 1) Contrato responsive acumulativo F1 + F2.
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $responsiveCssPath) | Out-Null
Copy-Item -LiteralPath $payloadResponsive -Destination $responsiveCssPath -Force

# 2) Index: cargar/actualizar contrato responsive y bustear module-loader.
$index = Get-Content -LiteralPath $indexPath -Raw
$newResponsiveLink = '<link href="./styles/responsive-contract.css?v=20260831-fase2-responsive-modulos-v001" rel="stylesheet"/>'

if ($index -match '<link\s+href="\./styles/responsive-contract\.css\?v=[^"]+"\s+rel="stylesheet"\s*/>') {
  $index = [regex]::Replace(
    $index,
    '<link\s+href="\./styles/responsive-contract\.css\?v=[^"]+"\s+rel="stylesheet"\s*/>',
    $newResponsiveLink,
    1
  )
} elseif ($index -match [regex]::Escape('styles/responsive-contract.css')) {
  # Existe sin version o con formato distinto: no se duplica; requiere revision manual.
  throw "Existe un enlace responsive-contract.css con formato no esperado. Revisar index.html antes de aplicar."
} else {
  $basePattern = '(<link\s+href="\./styles/base\.css\?v=[^"]+"\s+rel="stylesheet"\s*/>)'
  if ($index -notmatch $basePattern) {
    throw "No se encontro styles/base.css en index.html. No se modifico el index."
  }
  $index = [regex]::Replace($index, $basePattern, ('$1' + "`r`n" + $newResponsiveLink), 1)
}

$loaderTagPattern = '<script\s+src="\./core/module-loader\.js\?v=[^"]+"\s*></script>'
$newLoaderTag = '<script src="./core/module-loader.js?v=20260831-fase2-responsive-modulos-v001"></script>'
if ($index -match $loaderTagPattern) {
  $index = [regex]::Replace($index, $loaderTagPattern, $newLoaderTag, 1)
} else {
  throw "No se encontro el script de core/module-loader.js en index.html."
}

Write-Utf8NoBom -Path $indexPath -Content $index

# 3) Aislamiento de CSS lazy por ruta.
$loader = Get-Content -LiteralPath $loaderPath -Raw
if ($loader.Contains('function activateRouteStyles(config)')) {
  # Ya aplicado; no duplicar.
} else {
  $snippet = Get-Content -LiteralPath $loaderSnippetPath -Raw
  $pattern = '(?s)  async function ensure\(route\)\{.*?\r?\n  \}\r?\n\r?\n  function hasRoute'
  if ($loader -notmatch $pattern) {
    throw "No se encontro el bloque ensure(route) esperado en core/module-loader.js. Revisar merge antes de continuar."
  }
  $replacement = $snippet.TrimEnd() + "`r`n`r`n  function hasRoute"
  $loader = [regex]::Replace($loader, $pattern, [System.Text.RegularExpressions.MatchEvaluator]{ param($m) $replacement }, 1)
  Write-Utf8NoBom -Path $loaderPath -Content $loader
}

Write-Host "FASE 2 RESPONSIVE POR MODULOS aplicada localmente." -ForegroundColor Green
Write-Host "- CSS lazy aislado por ruta"
Write-Host "- Prospeccion/Proyeccion protegidos contra colision .vpr-*"
Write-Host "- Wrappers *-page sin max-width rigido"
Write-Host "- Controles se reacomodan; tablas conservan scroll horizontal local"
Write-Host "- Sin SQL / sin backend / sin cambios de datos"
