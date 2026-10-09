# [Aster | 2026-10-09 | ASTER-MG | FIX_2_INSTALACIONES_ADMINISTRACION_AUTOGUARDADO_V001]
# Solo cache bust local (core/module-loader.js e index.html).
# NO ejecuta SQL, Git push, modificaciones Aiven ni despliegues.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$loaderPath = Join-Path $root 'core\module-loader.js'
$indexPath = Join-Path $root 'index.html'
$frontendPath = Join-Path $root 'modules\instalaciones-administracion\instalaciones-administracion_cor.js'
$htmlPath = Join-Path $root 'modules\instalaciones-administracion\instalaciones-administracion_cor.html'
$cssPath = Join-Path $root 'modules\instalaciones-administracion\instalaciones-administracion-form_cor.css'
$constantsPath = Join-Path $root 'backend\src\modules\instalaciones-administracion\instalaciones-administracion.constants.js'
$servicePath = Join-Path $root 'backend\src\modules\instalaciones-administracion\instalaciones-administracion.service.js'
$routesPath = Join-Path $root 'backend\src\modules\instalaciones-administracion\instalaciones-administracion.routes.js'

foreach ($file in @($loaderPath,$indexPath,$frontendPath,$htmlPath,$cssPath,$constantsPath,$servicePath,$routesPath)) {
  if (!(Test-Path -LiteralPath $file -PathType Leaf)) { throw "Falta archivo necesario: $file" }
}
$enc = New-Object System.Text.UTF8Encoding($false)
$loader = [System.IO.File]::ReadAllText($loaderPath,[System.Text.Encoding]::UTF8)
$index = [System.IO.File]::ReadAllText($indexPath,[System.Text.Encoding]::UTF8)
$frontend = [System.IO.File]::ReadAllText($frontendPath,[System.Text.Encoding]::UTF8)
$html = [System.IO.File]::ReadAllText($htmlPath,[System.Text.Encoding]::UTF8)
$css = [System.IO.File]::ReadAllText($cssPath,[System.Text.Encoding]::UTF8)
$constants = [System.IO.File]::ReadAllText($constantsPath,[System.Text.Encoding]::UTF8)
$service = [System.IO.File]::ReadAllText($servicePath,[System.Text.Encoding]::UTF8)
$routes = [System.IO.File]::ReadAllText($routesPath,[System.Text.Encoding]::UTF8)

# Comprobar TODOS los prerequisitos antes de escribir nada. Si FIX1 no esta,
# NO desplegar una interfaz que pretenda permitir edicion sobre backend viejo.
if (!$frontend.Contains("VERSION_COR='20261009-autoguardado-fix2-v001'") -or
    !$frontend.Contains('function queueAutoSave_cor(field)') -or
    !$frontend.Contains('function drainAutoSave_cor()') -or
    !$html.Contains('instalaciones-administracion-form_cor.css?v=20261009-autoguardado-fix2-v001') -or
    !$css.Contains('.iadm-cor-autosave-feedback') -or
    !$constants.Contains('FULL_EDIT_PERMISSION_COR') -or
    !$service.Contains('ensureFullEditPermission_cor') -or
    !$routes.Contains("'/administracion/registros/:id/grupos/:grupo'")) {
  throw 'FIX2 o FIX1 backend incompleto. No se modifico ningun token de cache.'
}

$known = @(
  '20261008-instalaciones-administracion-fase3-v001',
  '20261008-instalaciones-administracion-fase4-v001',
  '20261008-instalaciones-administracion-fase5-v001',
  '20261008-instalaciones-administracion-fase6-v001',
  '20261008-instalaciones-administracion-fix1-v001',
  '20261008-instalaciones-administracion-fix2-v001',
  '20261009-instalaciones-administracion-fix3-v001',
  '20261009-instalaciones-administracion-fantasma-v001',
  '20261009-instalaciones-administracion-autoguardado-fix2-v001'
)
$new = '20261009-instalaciones-administracion-autoguardado-fix2-v001'

function Update-Token([string]$content,[string]$prefix,[string]$label) {
  $pattern = [regex]::Escape($prefix) + '(?<token>[a-zA-Z0-9._-]+)'
  $found = [regex]::Matches($content,$pattern)
  if ($found.Count -ne 1) { throw "Token de cache duplicado/ausente en $label; no se escribe nada." }
  $old = $found[0].Groups['token'].Value
  if ($known -cnotcontains $old) { throw "Version no aprobada [$old] en $label. Reconcilia el cambio antes de sobrescribir." }
  return $content.Replace($prefix + $old,$prefix + $new)
}

$newLoader = Update-Token $loader 'instalaciones-administracion_cor.js?v=' 'core/module-loader.js'
$newIndex = Update-Token $index 'core/module-loader.js?v=' 'index.html'
if ($newLoader -ceq $loader -and $newIndex -ceq $index) {
  Write-Host 'FIX2: cache ya actualizado. Sin cambios.' -ForegroundColor Green
  exit 0
}
try {
  [System.IO.File]::WriteAllText($loaderPath,$newLoader,$enc)
  [System.IO.File]::WriteAllText($indexPath,$newIndex,$enc)
} catch {
  [System.IO.File]::WriteAllText($loaderPath,$loader,$enc)
  [System.IO.File]::WriteAllText($indexPath,$index,$enc)
  throw
}
Write-Host 'FIX2: cache local actualizado correctamente.' -ForegroundColor Green
Write-Host 'Validar: git diff --check; git diff -- core/module-loader.js index.html' -ForegroundColor Cyan
