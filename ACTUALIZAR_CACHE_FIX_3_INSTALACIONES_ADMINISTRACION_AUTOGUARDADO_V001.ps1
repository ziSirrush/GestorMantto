# [Aster | 2026-10-09 | ASTER-MG | FIX_3_INSTALACIONES_ADMINISTRACION_INTEGRACION_QA_AUTOGUARDADO_V001]
# Solo dos tokens locales de cache; nunca realiza push, deploy ni consultas SQL.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$loaderPath = Join-Path $root 'core\module-loader.js'
$indexPath = Join-Path $root 'index.html'
$frontendPath = Join-Path $root 'modules\instalaciones-administracion\instalaciones-administracion_cor.js'
$servicePath = Join-Path $root 'backend\src\modules\instalaciones-administracion\instalaciones-administracion.service.js'
$constantsPath = Join-Path $root 'backend\src\modules\instalaciones-administracion\instalaciones-administracion.constants.js'
foreach ($p in @($loaderPath,$indexPath,$frontendPath,$servicePath,$constantsPath)) {
  if (!(Test-Path -LiteralPath $p -PathType Leaf)) { throw "Falta archivo requerido: $p" }
}
$loader=[System.IO.File]::ReadAllText($loaderPath,[System.Text.Encoding]::UTF8)
$index=[System.IO.File]::ReadAllText($indexPath,[System.Text.Encoding]::UTF8)
$front=[System.IO.File]::ReadAllText($frontendPath,[System.Text.Encoding]::UTF8)
$service=[System.IO.File]::ReadAllText($servicePath,[System.Text.Encoding]::UTF8)
$constants=[System.IO.File]::ReadAllText($constantsPath,[System.Text.Encoding]::UTF8)
if (!$front.Contains("VERSION_COR='20261009-autoguardado-fix3-qa-v001'") -or
    !$front.Contains('function syncAutoRead_cor(row,savedField)') -or
    !$front.Contains('st.autoOriginal') -or
    !$constants.Contains('FULL_EDIT_PERMISSION_COR') -or
    !$service.Contains('ensureFullEditPermission_cor')) {
  throw 'Faltan FIX 1/2/3 o la version no coincide; NO se modifico cache.'
}
$old='20261009-instalaciones-administracion-autoguardado-fix2-v001'
$new='20261009-instalaciones-administracion-autoguardado-fix3-qa-v001'
function ReemplazarUnToken([string]$source,[string]$prefix,[string]$desc) {
  $matches=[regex]::Matches($source, [regex]::Escape($prefix)+'(?<ver>[a-zA-Z0-9._-]+)')
  if ($matches.Count -ne 1) { throw "Referencia duplicada o ausente en $desc; no se escribio." }
  $version=$matches[0].Groups['ver'].Value
  if ($version -cne $old -and $version -cne $new) { throw "Token no autorizado $version en $desc. Reconciliar antes de aplicar." }
  return $source.Replace($prefix+$version,$prefix+$new)
}
$loaderNew=ReemplazarUnToken $loader 'instalaciones-administracion_cor.js?v=' 'core/module-loader.js'
$indexNew=ReemplazarUnToken $index 'core/module-loader.js?v=' 'index.html'
if ($loaderNew -ceq $loader -and $indexNew -ceq $index) {
  Write-Host 'FIX 3: cache ya actualizado, sin cambios.' -ForegroundColor Green
  exit 0
}
$utf8=New-Object System.Text.UTF8Encoding($false)
try {
  [System.IO.File]::WriteAllText($loaderPath,$loaderNew,$utf8)
  [System.IO.File]::WriteAllText($indexPath,$indexNew,$utf8)
} catch {
  [System.IO.File]::WriteAllText($loaderPath,$loader,$utf8)
  [System.IO.File]::WriteAllText($indexPath,$index,$utf8)
  throw
}
Write-Host 'FIX 3: tokens locales actualizados; revisar git diff --check y diff.' -ForegroundColor Green
