# [Aster | 2026-10-09 | ASTER-MG | FIX_2_INSTALACIONES_ADMINISTRACION_AUTOGUARDADO_V001]
# Solo QA local OFFLINE. No ejecuta operaciones contra Azure/Aiven/GitHub/Netlify.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Push-Location $root
try {
  if (!(Get-Command node -ErrorAction SilentlyContinue)) {
    throw 'Node.js no esta instalado o no esta en PATH.'
  }
  $js = '.\modules\instalaciones-administracion\instalaciones-administracion_cor.js'
  if (!(Test-Path -LiteralPath $js -PathType Leaf)) {throw 'No se encontro el JS del modulo.'}
  & node --check $js
  if ($LASTEXITCODE -ne 0) {throw 'JS no cumple la comprobacion de sintaxis.'}
  $tests = @(
    'tests/instalaciones-administracion-fase6-aislamiento-sesion.test.js',
    'tests/instalaciones-administracion-fix1-redisenio-filtros.test.js',
    'tests/instalaciones-administracion-fix2-detalle-equipo.test.js',
    'tests/instalaciones-administracion-fix3-edicion-multiple.test.js',
    'tests/instalaciones-administracion-fix4-integracion-qa.test.js',
    'tests/instalaciones-administracion-hotfix-only-full-group-by.test.js',
    'tests/instalaciones-administracion-fix1-edicion-total-backend.test.js',
    'tests/instalaciones-administracion-edicion-fantasma-v001.test.js',
    'tests/instalaciones-administracion-fix2-autoguardado-v001.test.js'
  )
  foreach ($test in $tests) {if (!(Test-Path -LiteralPath $test -PathType Leaf)) {throw "Falta prueba: $test"}}
  & node --test $tests
  if ($LASTEXITCODE -ne 0) {throw 'La suite local de pruebas fallo. No realizar despliegue.'}
  if (Get-Command git -ErrorAction SilentlyContinue) {
    & git diff --check
    if ($LASTEXITCODE -ne 0) {throw 'git diff --check reporto errores.'}
  }
  Write-Host 'FIX2: pruebas locales aprobadas; E2E aun pendiente.' -ForegroundColor Green
} finally {
  Pop-Location
}
