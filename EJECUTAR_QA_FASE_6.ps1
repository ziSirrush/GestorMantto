# [Aster | 2026-10-08 | ASTER-MG | FASE_6_INSTALACIONES_ADMINISTRACION_AISLAMIENTO_SESION_V001]
# Local, sin llamadas de red ni escrituras remotas.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root
$frontend = 'modules/instalaciones-administracion/instalaciones-administracion_cor.js'
$f6test = 'tests/instalaciones-administracion-fase6-aislamiento-sesion.test.js'
foreach ($file in @($frontend, $f6test)) {
    if (!(Test-Path -LiteralPath $file -PathType Leaf)) { throw "Archivo faltante: $file" }
    & node --check $file
    if ($LASTEXITCODE -ne 0) { throw "Error de sintaxis: $file" }
}
$tests = @(
    'tests/instalaciones-administracion-fase1-backend.test.js',
    'tests/instalaciones-administracion-fase2-permisos-auditoria.test.js',
    'tests/instalaciones-administracion-fase3-frontend-base.test.js',
    'tests/instalaciones-administracion-fase4-formularios-guardado.test.js',
    'tests/instalaciones-administracion-fase5-integracion-qa.test.js',
    $f6test
)
foreach ($file in $tests) {
    if (!(Test-Path -LiteralPath $file -PathType Leaf)) {
        throw "Falta prueba: $file. Verificar F1-F5."
    }
}
& node --test $tests
if ($LASTEXITCODE -ne 0) { throw 'Suite local fallida. No promover.' }
Write-Host 'QA LOCAL COMPLETA. Faltan las pruebas operativas E2E de Fase 5.' -ForegroundColor Green
