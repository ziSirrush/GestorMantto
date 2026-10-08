# [Aster | 2026-10-08 | ASTER-MG | FASE_5_INSTALACIONES_ADMINISTRACION_INTEGRACION_QA_V001]
# Test local; solo lectura de archivos y pruebas con dobles. No ejecuta writes externos.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

$syntaxFiles = @(
  'backend/src/modules/instalaciones-administracion/instalaciones-administracion.audit-service.js',
  'backend/src/modules/instalaciones-administracion/instalaciones-administracion.repository.js',
  'backend/src/modules/instalaciones-administracion/instalaciones-administracion.service.js',
  'modules/instalaciones-administracion/instalaciones-administracion_cor.js',
  'tests/instalaciones-administracion-fase5-integracion-qa.test.js',
  'validation/instalaciones-administracion-fase5-readonly-smoke.js'
)
foreach ($file in $syntaxFiles) {
  if (!(Test-Path -LiteralPath $file -PathType Leaf)) { throw "Archivo faltante: $file" }
  & node --check $file
  if ($LASTEXITCODE -ne 0) { throw "Error de sintaxis: $file" }
}

$tests = @(
  'tests/instalaciones-administracion-fase1-backend.test.js',
  'tests/instalaciones-administracion-fase2-permisos-auditoria.test.js',
  'tests/instalaciones-administracion-fase3-frontend-base.test.js',
  'tests/instalaciones-administracion-fase4-formularios-guardado.test.js',
  'tests/instalaciones-administracion-fase5-integracion-qa.test.js'
)
foreach ($file in $tests) {
  if (!(Test-Path -LiteralPath $file -PathType Leaf)) {
    throw "Prueba faltante: $file. Aplicar en orden las fases 1-5."
  }
}
& node --test $tests
if ($LASTEXITCODE -ne 0) { throw 'QA LOCAL FALLIDA. No continuar a promocion.' }
Write-Host 'QA LOCAL ESTATICA/MOCK APROBADA. E2E REAL y autorizacion siguen pendientes.' -ForegroundColor Green
