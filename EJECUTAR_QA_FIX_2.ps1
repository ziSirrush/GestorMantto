# [Aster | 2026-10-08 | ASTER-MG | FIX_2_INSTALACIONES_ADMINISTRACION_DETALLE_EQUIPO_V001]
# Solo pruebas offline, sin escrituras en GitHub/BD/cloud.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root
$code = @(
  '.\backend\src\modules\instalaciones-administracion\instalaciones-administracion.service.js',
  '.\backend\src\modules\instalaciones-administracion\instalaciones-administracion.controller.js',
  '.\backend\src\modules\instalaciones-administracion\instalaciones-administracion.routes.js',
  '.\modules\instalaciones-administracion\instalaciones-administracion_cor.js'
)
foreach ($file in $code) {
  & node --check $file
  if ($LASTEXITCODE -ne 0) { throw "Fallo de sintaxis en $file" }
}
$tests = @(
  '.\tests\instalaciones-administracion-fix2-detalle-equipo.test.js',
  '.\tests\instalaciones-administracion-fix1-redisenio-filtros.test.js',
  '.\tests\instalaciones-administracion-fase4-formularios-guardado.test.js',
  '.\tests\instalaciones-administracion-fase5-integracion-qa.test.js',
  '.\tests\instalaciones-administracion-fase6-aislamiento-sesion.test.js',
  '.\tests\instalaciones-administracion-fase3-frontend-base.test.js'
)
& node --test @tests
if ($LASTEXITCODE -ne 0) { throw 'Una o mas pruebas fallaron.' }
Write-Host 'FIX 2: verificacion estatica y pruebas locales completadas.' -ForegroundColor Green
