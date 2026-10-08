# [Aster | 2026-10-08 | ASTER-MG | FASE_5_INSTALACIONES_ADMINISTRACION_INTEGRACION_QA_V001]
# Cambios locales y puntuales. No modifica GitHub, Aiven, Azure ni Netlify.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$loaderPath = Join-Path $root 'core\module-loader.js'
$indexPath = Join-Path $root 'index.html'
$frontendPath = Join-Path $root 'modules\instalaciones-administracion\instalaciones-administracion_cor.js'
$auditPath = Join-Path $root 'backend\src\modules\instalaciones-administracion\instalaciones-administracion.audit-service.js'
$policyPath = Join-Path $root 'backend\src\modules\instalaciones-administracion\instalaciones-administracion.field-policy.js'
$formCss = Join-Path $root 'modules\instalaciones-administracion\instalaciones-administracion-form_cor.css'

foreach ($file in @($loaderPath,$indexPath,$frontendPath,$auditPath,$policyPath,$formCss)) {
    if (!(Test-Path -LiteralPath $file -PathType Leaf)) {
        throw "Falta archivo imprescindible: $file. Debe estar aplicada Fase 4 antes de Fase 5."
    }
}
$utf8 = New-Object System.Text.UTF8Encoding($false)
$loader = [System.IO.File]::ReadAllText($loaderPath, [System.Text.Encoding]::UTF8)
$index = [System.IO.File]::ReadAllText($indexPath, [System.Text.Encoding]::UTF8)
$front = [System.IO.File]::ReadAllText($frontendPath, [System.Text.Encoding]::UTF8)
$audit = [System.IO.File]::ReadAllText($auditPath, [System.Text.Encoding]::UTF8)

if (!$front.Contains("VERSION_COR='20261008-fase5-v001'")) {
    throw 'No esta aplicada la version Fase 5 del frontend. No se modifico ningun cache bust.'
}
if (!$audit.Contains('MAX_AUDIT_JSON_BYTES_COR')) {
    throw 'No esta aplicada la validacion de auditoria Fase 5. No se modifico ningun cache bust.'
}
$phase4 = '20261008-instalaciones-administracion-fase4-v001'
$phase5 = '20261008-instalaciones-administracion-fase5-v001'
$oldJs = 'instalaciones-administracion_cor.js?v=' + $phase4
$newJs = 'instalaciones-administracion_cor.js?v=' + $phase5
$oldIndex = 'core/module-loader.js?v=' + $phase4
$newIndex = 'core/module-loader.js?v=' + $phase5

# Dos precondiciones completas ANTES de modificar un solo archivo.
if (!$loader.Contains($oldJs) -and !$loader.Contains($newJs)) {
    throw 'module-loader.js no coincide con la base de Fase 4. No se modifico ningun archivo.'
}
if (!$index.Contains($oldIndex) -and !$index.Contains($newIndex)) {
    throw 'index.html no coincide con la base de Fase 4. No se modifico ningun archivo.'
}
$newLoader = $loader.Replace($oldJs,$newJs)
$newIndexText = $index.Replace($oldIndex,$newIndex)
if ($newLoader -ceq $loader -and $newIndexText -ceq $index) {
    Write-Host 'FASE 5: cache bust ya aplicado; sin cambios.' -ForegroundColor Green
    exit 0
}
try {
    [System.IO.File]::WriteAllText($loaderPath, $newLoader, $utf8)
    [System.IO.File]::WriteAllText($indexPath, $newIndexText, $utf8)
} catch {
    # Reversion de ambos archivos locales si falla alguna de las dos escrituras.
    [System.IO.File]::WriteAllText($loaderPath, $loader, $utf8)
    [System.IO.File]::WriteAllText($indexPath, $index, $utf8)
    throw
}
Write-Host 'FASE 5: cache bust local aplicado; revisar diff de core/module-loader.js e index.html.' -ForegroundColor Green
