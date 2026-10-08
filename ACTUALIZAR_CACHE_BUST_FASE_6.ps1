# [Aster | 2026-10-08 | ASTER-MG | FASE_6_INSTALACIONES_ADMINISTRACION_AISLAMIENTO_SESION_V001]
# Solo dos reemplazos locales de tokens, despues de Fase 4 + Fase 5.
# No modifica GitHub, Aiven, Azure, Netlify ni GAS.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$loaderPath = Join-Path $root 'core\module-loader.js'
$indexPath = Join-Path $root 'index.html'
$frontendPath = Join-Path $root 'modules\instalaciones-administracion\instalaciones-administracion_cor.js'
$auditPath = Join-Path $root 'backend\src\modules\instalaciones-administracion\instalaciones-administracion.audit-service.js'

foreach ($file in @($loaderPath, $indexPath, $frontendPath, $auditPath)) {
    if (!(Test-Path -LiteralPath $file -PathType Leaf)) {
        throw "Archivo requerido ausente: $file. Instalar F4 y F5 antes de F6."
    }
}
$utf8 = New-Object System.Text.UTF8Encoding($false)
$loader = [System.IO.File]::ReadAllText($loaderPath, [System.Text.Encoding]::UTF8)
$index = [System.IO.File]::ReadAllText($indexPath, [System.Text.Encoding]::UTF8)
$frontend = [System.IO.File]::ReadAllText($frontendPath, [System.Text.Encoding]::UTF8)
$audit = [System.IO.File]::ReadAllText($auditPath, [System.Text.Encoding]::UTF8)
if (!$frontend.Contains('FASE_6_INSTALACIONES_ADMINISTRACION_AISLAMIENTO_SESION_V001') -or
    !$frontend.Contains('resetSensitiveState_cor')) {
    throw 'Frontend F6 ausente o distinto. No se modifico el cache.'
}
if (!$audit.Contains('MAX_AUDIT_JSON_BYTES_COR')) {
    throw 'Auditoria F5 ausente. No se modifico el cache.'
}
$phase5 = '20261008-instalaciones-administracion-fase5-v001'
$phase6 = '20261008-instalaciones-administracion-fase6-v001'
$oldJs = 'instalaciones-administracion_cor.js?v=' + $phase5
$newJs = 'instalaciones-administracion_cor.js?v=' + $phase6
$oldIndex = 'core/module-loader.js?v=' + $phase5
$newIndex = 'core/module-loader.js?v=' + $phase6

# Todas las precondiciones ANTES de la primera escritura; rechazar mezcla ambigua.
if ($loader.Contains($oldJs) -and $loader.Contains($newJs)) {
    throw 'Versiones F5/F6 simultaneas en loader. Resolver a mano.'
}
if ($index.Contains($oldIndex) -and $index.Contains($newIndex)) {
    throw 'Versiones F5/F6 simultaneas en index. Resolver a mano.'
}
if (!$loader.Contains($oldJs) -and !$loader.Contains($newJs)) {
    throw 'Loader no esta en F5 ni en F6. No modificar base desconocida.'
}
if (!$index.Contains($oldIndex) -and !$index.Contains($newIndex)) {
    throw 'Index no esta en F5 ni en F6. No modificar base desconocida.'
}
$newLoader = $loader.Replace($oldJs, $newJs)
$newIndexText = $index.Replace($oldIndex, $newIndex)
if ($newLoader -ceq $loader -and $newIndexText -ceq $index) {
    Write-Host 'FASE 6: cache bust ya aplicado, sin cambios.' -ForegroundColor Green
    exit 0
}
try {
    [System.IO.File]::WriteAllText($loaderPath, $newLoader, $utf8)
    [System.IO.File]::WriteAllText($indexPath, $newIndexText, $utf8)
} catch {
    [System.IO.File]::WriteAllText($loaderPath, $loader, $utf8)
    [System.IO.File]::WriteAllText($indexPath, $index, $utf8)
    throw
}
Write-Host 'FASE 6: cache actualizado. Revisar git diff -- core/module-loader.js index.html.' -ForegroundColor Green
