# [Aster | 2026-10-09 | ASTER-MG | FIX_1_INSTALACIONES_ADMINISTRACION_EDICION_TOTAL_BACKEND_V001]
# Solo pruebas locales de codigo. Nunca escribe BD, repo remoto, Azure o Netlify.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Push-Location $root
try {
  $node = (Get-Command node -ErrorAction Stop).Source
  $source = @(
    'backend/src/modules/instalaciones-administracion/instalaciones-administracion.constants.js',
    'backend/src/modules/instalaciones-administracion/instalaciones-administracion.validation.js',
    'backend/src/modules/instalaciones-administracion/instalaciones-administracion.service.js',
    'backend/src/modules/instalaciones-administracion/instalaciones-administracion.repository.js',
    'backend/src/modules/instalaciones-administracion/instalaciones-administracion.routes.js'
  )
  $tests = @(
    'tests/instalaciones-administracion-fase1-backend.test.js',
    'tests/instalaciones-administracion-fase2-permisos-auditoria.test.js',
    'tests/instalaciones-administracion-fix2-detalle-equipo.test.js',
    'tests/instalaciones-administracion-fix3-edicion-multiple.test.js',
    'tests/instalaciones-administracion-fix1-edicion-total-backend.test.js'
  )
  foreach ($file in ($source + $tests + @(
    'database/FASE_2_INSTALACIONES_ADMINISTRACION_PERMISOS_V001.sql',
    'database/FIX_1_INSTALACIONES_ADMINISTRACION_PERMISO_TOTAL_V001.sql',
    'database/QA_FIX_1_INSTALACIONES_ADMINISTRACION_PERMISOS_SOLO_LECTURA_V001.sql'
  ))) {
    if (-not (Test-Path -LiteralPath $file -PathType Leaf)) {
      throw "Falta archivo necesario: $file. Verifica que extrajiste el ZIP en la raiz del repositorio."
    }
  }
  foreach ($file in ($source + $tests)) {
    & $node --check $file
    if ($LASTEXITCODE -ne 0) { throw "Error de sintaxis: $file" }
  }
  & $node --test @tests
  if ($LASTEXITCODE -ne 0) { throw 'Fallo la regresion local. No desplegar.' }
  if (Get-Command git -ErrorAction SilentlyContinue) {
    & git diff --check
    if ($LASTEXITCODE -ne 0) { throw 'git diff --check detecto errores.' }
    & git status --short
  }
  Write-Host 'FIX 1: pruebas locales finalizadas. Revisa los resultados TAP anteriores.' -ForegroundColor Green
  Write-Host 'No ejecutado: SQL de permiso, asignaciones, Azure/Aiven real ni E2E.' -ForegroundColor Yellow
} finally {
  Pop-Location
}
