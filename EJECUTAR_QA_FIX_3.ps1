# [Aster | 2026-10-09 | ASTER-MG | FIX_3_INSTALACIONES_ADMINISTRACION_EDICION_MULTIPLE_V001]
# Pruebas NO destructivas. Se ejecutan desde la raiz del repositorio.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Push-Location $root
try {
  $sources = @(
    'backend/src/modules/instalaciones-administracion/instalaciones-administracion.controller.js',
    'backend/src/modules/instalaciones-administracion/instalaciones-administracion.repository.js',
    'backend/src/modules/instalaciones-administracion/instalaciones-administracion.routes.js',
    'backend/src/modules/instalaciones-administracion/instalaciones-administracion.service.js',
    'modules/instalaciones-administracion/instalaciones-administracion_cor.js',
    'tests/instalaciones-administracion-fix3-edicion-multiple.test.js'
  )
  foreach ($file in $sources) {
    if (!(Test-Path -LiteralPath $file)) { throw "Falta archivo: $file" }
    & node --check $file
    if ($LASTEXITCODE -ne 0) { throw "Error sintactico: $file" }
  }
  $suites = @(
    'tests/instalaciones-administracion-fix1-redisenio-filtros.test.js',
    'tests/instalaciones-administracion-fix2-detalle-equipo.test.js',
    'tests/instalaciones-administracion-fix3-edicion-multiple.test.js',
    'tests/instalaciones-administracion-fase3-frontend-base.test.js',
    'tests/instalaciones-administracion-fase4-formularios-guardado.test.js',
    'tests/instalaciones-administracion-fase5-integracion-qa.test.js',
    'tests/instalaciones-administracion-fase6-aislamiento-sesion.test.js'
  )
  foreach ($file in $suites) {
    if (!(Test-Path -LiteralPath $file)) { throw "Falta suite: $file" }
  }
  & node --test @suites
  if ($LASTEXITCODE -ne 0) { throw 'La regresion automatizada fallo. No desplegar.' }
  & git diff --check
  if ($LASTEXITCODE -ne 0) { throw 'git diff --check detecto errores.' }
  Write-Host 'QA local FIX 3: pruebas finalizadas sin errores.' -ForegroundColor Green
} finally { Pop-Location }
