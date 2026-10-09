# [Aster | 2026-10-09 | ASTER-MG | FIX_4_INSTALACIONES_ADMINISTRACION_INTEGRACION_QA_V001]
# QA 100% LOCAL/OFFLINE. No aplica cambios de BD, GitHub, Azure, Netlify ni GAS.
# Ejecutar en PowerShell DESDE LA RAIZ del repo, tras F1-F3 + FIX1-FIX3.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Push-Location $root
try {
  $service = 'backend/src/modules/instalaciones-administracion/instalaciones-administracion.service.js'
  $routes = 'backend/src/modules/instalaciones-administracion/instalaciones-administracion.routes.js'
  $repo = 'backend/src/modules/instalaciones-administracion/instalaciones-administracion.repository.js'
  $front = 'modules/instalaciones-administracion/instalaciones-administracion_cor.js'
  $html = 'modules/instalaciones-administracion/instalaciones-administracion_cor.html'
  $loader = 'core/module-loader.js'
  $index = 'index.html'
  $node = (Get-Command node -ErrorAction Stop).Source
  $syntax = @(
    $service,$repo,$routes,
    'backend/src/modules/instalaciones-administracion/instalaciones-administracion.controller.js',
    'backend/src/modules/instalaciones-administracion/instalaciones-administracion.audit-service.js',
    $front,
    'validation/instalaciones-administracion-fix4-readonly-smoke.js',
    'tests/instalaciones-administracion-fix4-integracion-qa.test.js'
  )
  foreach ($file in $syntax) {
    if (!(Test-Path -LiteralPath $file -PathType Leaf)) { throw "No existe: $file" }
    & $node --check $file
    if ($LASTEXITCODE -ne 0) { throw "Fallo sintaxis: $file" }
  }
  foreach ($file in @($html,$loader,$index)) {
    if (!(Test-Path -LiteralPath $file -PathType Leaf)) { throw "No existe: $file" }
  }
  $code = [System.IO.File]::ReadAllText((Join-Path $root $service))
  $frontend = [System.IO.File]::ReadAllText((Join-Path $root $front))
  $markup = [System.IO.File]::ReadAllText((Join-Path $root $html))
  $loaderText = [System.IO.File]::ReadAllText((Join-Path $root $loader))
  $indexText = [System.IO.File]::ReadAllText((Join-Path $root $index))
  $cacheVersion = '20261009-instalaciones-administracion-fix3-v001'
  if (!$code.Contains('FIX_4_INSTALACIONES_ADMINISTRACION_INTEGRACION_QA_V001') -or
      $code.Contains('data: visibleGroupData_cor') -or
      !$frontend.Contains("VERSION_COR='20261009-fix3-v001'") -or
      !$markup.Contains('iadm-cor-bulk-editor') -or
      !$loaderText.Contains('instalaciones-administracion_cor.js?v=' + $cacheVersion) -or
      !$indexText.Contains('core/module-loader.js?v=' + $cacheVersion)) {
    throw 'No coincide la base F1-F3 + FIX1-FIX3 y sus caches. NO desplegar.'
  }
  $tests = @(
    'tests/instalaciones-administracion-fase1-backend.test.js',
    'tests/instalaciones-administracion-fase2-permisos-auditoria.test.js',
    'tests/instalaciones-administracion-fase3-frontend-base.test.js',
    'tests/instalaciones-administracion-fase4-formularios-guardado.test.js',
    'tests/instalaciones-administracion-fase5-integracion-qa.test.js',
    'tests/instalaciones-administracion-fase6-aislamiento-sesion.test.js',
    'tests/instalaciones-administracion-fix1-redisenio-filtros.test.js',
    'tests/instalaciones-administracion-fix2-detalle-equipo.test.js',
    'tests/instalaciones-administracion-fix3-edicion-multiple.test.js',
    'tests/instalaciones-administracion-fix4-integracion-qa.test.js'
  )
  foreach ($file in $tests) {
    if (!(Test-Path -LiteralPath $file -PathType Leaf)) { throw "Falta suite: $file" }
  }
  & $node --test @tests
  if ($LASTEXITCODE -ne 0) { throw 'Suite de regresion FALLIDA. No liberar.' }
  & git diff --check
  if ($LASTEXITCODE -ne 0) { throw 'git diff --check detecto un error.' }
  Write-Host 'FIX 4: sintaxis y regresion local completas.' -ForegroundColor Green
  Write-Host 'ESTO NO ES CERTIFICACION E2E, NI PRUEBA EN AZURE/AIVEN/NETLIFY.' -ForegroundColor Yellow
} finally {
  Pop-Location
}
