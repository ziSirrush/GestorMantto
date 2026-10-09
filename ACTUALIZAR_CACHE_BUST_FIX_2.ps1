# [Aster | 2026-10-08 | ASTER-MG | FIX_2_INSTALACIONES_ADMINISTRACION_DETALLE_EQUIPO_V001]
# Ejecutar localmente despues de extraer el ZIP en la raiz del repositorio.
# Solo modifica los dos tokens de cache del modulo en core/module-loader.js e index.html.
# No hace push, deploy, SQL, ni modificacion de usuarios/permisos.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$loaderPath = Join-Path $root 'core\module-loader.js'
$indexPath = Join-Path $root 'index.html'
$frontPath = Join-Path $root 'modules\instalaciones-administracion\instalaciones-administracion_cor.js'
$htmlPath = Join-Path $root 'modules\instalaciones-administracion\instalaciones-administracion_cor.html'
$backendPath = Join-Path $root 'backend\src\modules\instalaciones-administracion\instalaciones-administracion.routes.js'
$servicePath = Join-Path $root 'backend\src\modules\instalaciones-administracion\instalaciones-administracion.service.js'

foreach ($file in @($loaderPath,$indexPath,$frontPath,$htmlPath,$backendPath,$servicePath)) {
  if (!(Test-Path -LiteralPath $file -PathType Leaf)) { throw "Falta archivo requerido: $file" }
}
$utf8 = New-Object System.Text.UTF8Encoding($false)
$loader = [System.IO.File]::ReadAllText($loaderPath,[System.Text.Encoding]::UTF8)
$index = [System.IO.File]::ReadAllText($indexPath,[System.Text.Encoding]::UTF8)
$front = [System.IO.File]::ReadAllText($frontPath,[System.Text.Encoding]::UTF8)
$html = [System.IO.File]::ReadAllText($htmlPath,[System.Text.Encoding]::UTF8)
$backend = [System.IO.File]::ReadAllText($backendPath,[System.Text.Encoding]::UTF8)
$service = [System.IO.File]::ReadAllText($servicePath,[System.Text.Encoding]::UTF8)

if (!$front.Contains("VERSION_COR='20261008-fix2-v001'") -or
    !$front.Contains("'/registros/'+encodeURIComponent(id)+'/detalle'") -or
    !$html.Contains('iadm-cor-detail-edit-btn') -or
    !$backend.Contains("'/administracion/registros/:id/detalle'") -or
    !$service.Contains('async function updateDetail_cor(')) {
  throw 'El codigo FIX 2 no esta completo. No se modifica ningun token de cache.'
}

$old = '20261008-instalaciones-administracion-fix1-v001'
$new = '20261008-instalaciones-administracion-fix2-v001'
$loaderPrefix = 'instalaciones-administracion_cor.js?v='
$indexPrefix = 'core/module-loader.js?v='

function Replace-CacheToken([string]$contents,[string]$prefix,[string]$fileLabel) {
  $containsOld = $contents.Contains($prefix + $old)
  $containsNew = $contents.Contains($prefix + $new)
  if ($containsOld -eq $containsNew) {
    throw "Token inesperado o ambiguo en $fileLabel. Se requiere FIX 1 correctamente aplicado."
  }
  if ($containsNew) { return $contents }
  return $contents.Replace($prefix + $old,$prefix + $new)
}

# Prevalidar ambos archivos ANTES de tocar disco.
$newLoader = Replace-CacheToken $loader $loaderPrefix 'core/module-loader.js'
$newIndex = Replace-CacheToken $index $indexPrefix 'index.html'
if ($newLoader -ceq $loader -and $newIndex -ceq $index) {
  Write-Host 'FIX 2: cache bust ya actualizado; sin cambios.' -ForegroundColor Green
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
Write-Host 'FIX 2: cache bust local aplicado.' -ForegroundColor Green
Write-Host 'Validar: git diff --check; git diff -- core/module-loader.js index.html' -ForegroundColor Cyan
