# [Aster | 2026-10-08 | ASTER-MG | FIX_1_INSTALACIONES_ADMINISTRACION_REDISENO_V001]
# Ejecutar localmente DESPUES de extraer el ZIP en la raiz del repositorio.
# Solo modifica los tokens de carga del modulo en core/module-loader.js e index.html.
# No realiza push, despliegues, cambios Aiven ni cambios de permisos.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$loaderPath = Join-Path $root 'core\module-loader.js'
$indexPath = Join-Path $root 'index.html'
$frontPath = Join-Path $root 'modules\instalaciones-administracion\instalaciones-administracion_cor.js'
$htmlPath = Join-Path $root 'modules\instalaciones-administracion\instalaciones-administracion_cor.html'
$backendPath = Join-Path $root 'backend\src\modules\instalaciones-administracion\instalaciones-administracion.routes.js'

foreach ($file in @($loaderPath,$indexPath,$frontPath,$htmlPath,$backendPath)) {
  if (!(Test-Path -LiteralPath $file -PathType Leaf)) { throw "Falta archivo requerido: $file" }
}
$utf8 = New-Object System.Text.UTF8Encoding($false)
$loader = [System.IO.File]::ReadAllText($loaderPath,[System.Text.Encoding]::UTF8)
$index = [System.IO.File]::ReadAllText($indexPath,[System.Text.Encoding]::UTF8)
$front = [System.IO.File]::ReadAllText($frontPath,[System.Text.Encoding]::UTF8)
$html = [System.IO.File]::ReadAllText($htmlPath,[System.Text.Encoding]::UTF8)
$backend = [System.IO.File]::ReadAllText($backendPath,[System.Text.Encoding]::UTF8)
if (!$front.Contains("VERSION_COR='20261008-fix1-v001'") -or
    !$html.Contains('iadm-cor-filter-supervisor') -or
    !$backend.Contains("/administracion/proyectos")) {
  throw 'El FIX 1 no esta completo. No se modifica ningun token de cache.'
}

$known = @(
  '20261008-instalaciones-administracion-fase3-v001',
  '20261008-instalaciones-administracion-fase4-v001',
  '20261008-instalaciones-administracion-fase5-v001',
  '20261008-instalaciones-administracion-fase6-v001',
  '20261008-instalaciones-administracion-fix1-v001'
)
$target = '20261008-instalaciones-administracion-fix1-v001'
$loaderPrefix = 'instalaciones-administracion_cor.js?v='
$indexPrefix = 'core/module-loader.js?v='

function Replace-CacheToken([string]$contents,[string]$prefix,[string]$fileLabel) {
  $matches = @($known | Where-Object { $contents.Contains($prefix + $_) })
  if ($matches.Count -ne 1) {
    throw "Token $fileLabel no coincide con una version admitida o existen duplicados. No se aplicara el cache bust."
  }
  return $contents.Replace($prefix + $matches[0],$prefix + $target)
}
# Prevalidar AMBOS archivos antes de hacer escrituras.
$newLoader = Replace-CacheToken $loader $loaderPrefix 'module-loader.js'
$newIndex = Replace-CacheToken $index $indexPrefix 'index.html'
if ($newLoader -ceq $loader -and $newIndex -ceq $index) {
  Write-Host 'FIX 1: cache bust ya actualizado.' -ForegroundColor Green
  exit 0
}
try {
  [System.IO.File]::WriteAllText($loaderPath,$newLoader,$utf8)
  [System.IO.File]::WriteAllText($indexPath,$newIndex,$utf8)
} catch {
  [System.IO.File]::WriteAllText($loaderPath,$loader,$utf8)
  [System.IO.File]::WriteAllText($indexPath,$index,$utf8)
  throw
}
Write-Host 'FIX 1: cache bust local aplicado.' -ForegroundColor Green
Write-Host 'Revisar: git diff --check; git diff -- core/module-loader.js index.html' -ForegroundColor Cyan
