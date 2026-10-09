# [Aster | 2026-10-09 | ASTER-MG | FIX_3_INSTALACIONES_ADMINISTRACION_EDICION_MULTIPLE_V001]
# Ejecutar LOCALMENTE en la raiz del repositorio DESPUES de FIX 1 y FIX 2.
# Solo cambia los tokens de cache de este modulo; no hace push, despliegue ni SQL.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$loaderPath = Join-Path $root 'core\module-loader.js'
$indexPath = Join-Path $root 'index.html'
$frontPath = Join-Path $root 'modules\instalaciones-administracion\instalaciones-administracion_cor.js'
$htmlPath = Join-Path $root 'modules\instalaciones-administracion\instalaciones-administracion_cor.html'
$routesPath = Join-Path $root 'backend\src\modules\instalaciones-administracion\instalaciones-administracion.routes.js'
$servicePath = Join-Path $root 'backend\src\modules\instalaciones-administracion\instalaciones-administracion.service.js'
$repoPath = Join-Path $root 'backend\src\modules\instalaciones-administracion\instalaciones-administracion.repository.js'

foreach ($file in @($loaderPath,$indexPath,$frontPath,$htmlPath,$routesPath,$servicePath,$repoPath)) {
  if (!(Test-Path -LiteralPath $file -PathType Leaf)) { throw "Archivo requerido ausente: $file" }
}
$enc = New-Object System.Text.UTF8Encoding($false)
$loader = [System.IO.File]::ReadAllText($loaderPath,[System.Text.Encoding]::UTF8)
$index = [System.IO.File]::ReadAllText($indexPath,[System.Text.Encoding]::UTF8)
$front = [System.IO.File]::ReadAllText($frontPath,[System.Text.Encoding]::UTF8)
$html = [System.IO.File]::ReadAllText($htmlPath,[System.Text.Encoding]::UTF8)
$routes = [System.IO.File]::ReadAllText($routesPath,[System.Text.Encoding]::UTF8)
$service = [System.IO.File]::ReadAllText($servicePath,[System.Text.Encoding]::UTF8)
$repository = [System.IO.File]::ReadAllText($repoPath,[System.Text.Encoding]::UTF8)

# Prevalidar el FIX instalado ANTES de alterar el archivo global.
if (!$front.Contains("VERSION_COR='20261009-fix3-v001'") -or
    !$html.Contains('iadm-cor-bulk-editor') -or
    !$routes.Contains("'/administracion/proyectos/:projectKey/equipos/edicion-multiple'") -or
    !$service.Contains('async function updateMulti_cor(') -or
    !$repository.Contains('async function updateProjectBatch_cor(')) {
  throw 'FIX 3 incompleto o distinto. No se modifica cache.'
}
$old = '20261008-instalaciones-administracion-fix2-v001'
$new = '20261009-instalaciones-administracion-fix3-v001'

function Replace-Token([string]$content,[string]$prefix,[string]$label) {
  $oldValue = $prefix + $old
  $newValue = $prefix + $new
  $hasOld = $content.Contains($oldValue)
  $hasNew = $content.Contains($newValue)
  if ($hasOld -eq $hasNew) {
    throw "Token ausente/ambiguo en $label. Verifica que FIX 2 esta aplicado."
  }
  if ($hasNew) { return $content }
  return $content.Replace($oldValue,$newValue)
}

$newLoader = Replace-Token $loader 'instalaciones-administracion_cor.js?v=' 'core/module-loader.js'
$newIndex = Replace-Token $index 'core/module-loader.js?v=' 'index.html'
if ($newLoader -ceq $loader -and $newIndex -ceq $index) {
  Write-Host 'FIX 3: tokens de cache ya actualizados.' -ForegroundColor Green
  exit 0
}
try {
  [System.IO.File]::WriteAllText($loaderPath,$newLoader,$enc)
  [System.IO.File]::WriteAllText($indexPath,$newIndex,$enc)
} catch {
  # Si falla alguna escritura, se restauran los contenidos originales locales.
  [System.IO.File]::WriteAllText($loaderPath,$loader,$enc)
  [System.IO.File]::WriteAllText($indexPath,$index,$enc)
  throw
}
Write-Host 'FIX 3: cache de Instalaciones/Administracion actualizado localmente.' -ForegroundColor Green
Write-Host 'Ejecuta git diff --check y revisa el diff antes de cualquier push.' -ForegroundColor Cyan
