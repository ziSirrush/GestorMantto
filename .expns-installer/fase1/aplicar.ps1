# BLT NOW | EXPERIMENTAL NS - FASE 1 | SOLO APLICACION LOCAL
# Copiar TODO este bloque a PowerShell desde el repositorio local.
# No hay push, commit, despliegue, ni modificaciones de BD.
# Requiere la version main aaa1f1ed30798716d0885dee1692ce56b1583402.
# Por seguridad ABORTA si los archivos afectados tienen cambios locales.

$ErrorActionPreference = 'Stop'
$REPO = 'C:\Users\T14s\Downloads\mantto_gestor_frontend'
$ZIP = Join-Path $env:USERPROFILE 'Downloads\EXPERIMENTAL_NS_FASE1_V001.zip'
$EXPECTED = 'aaa1f1ed30798716d0885dee1692ce56b1583402'
$utf8 = New-Object System.Text.UTF8Encoding($false)

function Replace-Exactly-Once([string]$source,[string]$before,[string]$after,[string]$what) {
    $occurrences = [regex]::Matches($source,[regex]::Escape($before)).Count
    if($occurrences -ne 1){throw "Marcador de $what inesperado: $occurrences coincidencias. NO se aplica la Fase 1."}
    return $source.Replace($before,$after)
}
function Match-Newlines([string]$source,[string]$newline) {
    return $source.Replace("`r`n", "`n").Replace("`n", $newline)
}

if(-not (Test-Path -LiteralPath $ZIP)){throw "No encuentro el ZIP: $ZIP"}
if(-not (Test-Path -LiteralPath (Join-Path $REPO '.git'))){throw "La carpeta no contiene el repositorio Git: $REPO"}
$head = (& git -C $REPO rev-parse HEAD).Trim()
if($LASTEXITCODE -ne 0 -or $head -ne $EXPECTED){throw "El repositorio ya avanzo: HEAD=$head. Requiere revalidar la Fase 1 contra main."}
$dirty = & git -C $REPO status --porcelain -- index.html core/router.js
if($LASTEXITCODE -ne 0 -or $dirty){throw 'index.html o core/router.js tienen cambios locales. Guardalos antes de continuar.'}
$work = Join-Path $env:TEMP ('EXPNS_F1_' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $work | Out-Null
Expand-Archive -LiteralPath $ZIP -DestinationPath $work

$indexPath = Join-Path $REPO 'index.html'
$routerPath = Join-Path $REPO 'core\router.js'
$index = [System.IO.File]::ReadAllText($indexPath, [System.Text.Encoding]::UTF8)
$router = [System.IO.File]::ReadAllText($routerPath, [System.Text.Encoding]::UTF8)
$htmlNL = if($index.Contains("`r`n")){"`r`n"}else{"`n"}
$routerNL = if($router.Contains("`r`n")){"`r`n"}else{"`n"}
if($index.Contains('data-group="experimental-ns"') -or $router.Contains("'experimental-ns-resumen-dia'")){
    throw 'Experimental NS ya se encuentra en el codigo. No aplicar dos veces.'
}

$menu = @'
<section class="side-group programmer" data-group="experimental-ns" style="display:none">
<button aria-controls="side-group-experimental-ns" aria-expanded="false" class="side-group-toggle" type="button">
<span class="side-group-icon">🧪</span><b>Experimental NS</b><i>⌄</i>
</button>
<div class="side-group-items" id="side-group-experimental-ns">
<button class="side-item" data-route="experimental-ns-resumen-dia" type="button"><span>📅</span><b>Resumen del Día</b></button>
<button class="side-item" data-route="experimental-ns-equipos-criticos" type="button"><span>⚠️</span><b>Equipos Críticos</b></button>
<button class="side-item" data-route="experimental-ns-proyectos-mantenimiento" type="button"><span>🏗️</span><b>Proyectos de Mantenimiento</b></button>
</div>
</section>
'@
$menu = Match-Newlines $menu $htmlNL
$anchor = '<section class="side-group" data-group="operacion">'
$index = Replace-Exactly-Once $index $anchor ($menu + $htmlNL + $anchor) 'menu Experimental NS'

$views = @'
<section aria-label="Resumen del Día Experimental NS" class="view expns-view" data-view="experimental-ns-resumen-dia" id="view-experimental-ns-resumen-dia"></section>
<section aria-label="Equipos Críticos Experimental NS" class="view expns-view" data-view="experimental-ns-equipos-criticos" id="view-experimental-ns-equipos-criticos"></section>
<section aria-label="Proyectos de Mantenimiento Experimental NS" class="view expns-view" data-view="experimental-ns-proyectos-mantenimiento" id="view-experimental-ns-proyectos-mantenimiento"></section>
'@
$views = Match-Newlines $views $htmlNL
$anchor = '<section aria-label="Dashboard Cobranza United"'
$index = Replace-Exactly-Once $index $anchor ($views + $htmlNL + $anchor) 'vistas Experimental NS'

$anchor = '<link rel="stylesheet" href="./styles/device-permissions.css?v=20260731-mobile-v006"/>'
$addition = '<link rel="stylesheet" href="./modules/experimental-ns/experimental-ns.css?v=20261026-f1-v001"/>'
$index = Replace-Exactly-Once $index $anchor ($anchor + $htmlNL + $addition) 'hoja de estilos Experimental NS'

$anchor = '<script src="./core/app.js?v=20261023-context-back-only-v001"></script>'
$addition = '<script src="./modules/experimental-ns/experimental-ns.js?v=20261026-f1-v001"></script>'
$index = Replace-Exactly-Once $index $anchor ($addition + $htmlNL + $anchor) 'modulo JavaScript Experimental NS'

$anchor = "    'experimental-atencion-prioritaria':'Atención Prioritaria',"
$names = @'
    'experimental-ns-resumen-dia':'Resumen del Día · NS',
    'experimental-ns-equipos-criticos':'Equipos Críticos · NS',
    'experimental-ns-proyectos-mantenimiento':'Proyectos de Mantenimiento · NS',
'@
$router = Replace-Exactly-Once $router $anchor ((Match-Newlines $names $routerNL) + $routerNL + $anchor) 'titulos del router'

$anchor = "    if(route==='detalle' && showDetalle(payload)) return;"
$routeHandler = @'
    // Experimental NS Fase 1: vista estatica independiente y acceso piloto solo Programador.
    // No se consultan APIs; los permisos funcionales/puertas/alcance se implementan en F2.
    if(['experimental-ns-resumen-dia','experimental-ns-equipos-criticos','experimental-ns-proyectos-mantenimiento'].includes(route)){
      const nsUser = window.ManttoAuth && typeof window.ManttoAuth.getUser === 'function' ? window.ManttoAuth.getUser() : null;
      const nsRoles = new Set([nsUser && nsUser.rol, ...(Array.isArray(nsUser && nsUser.roles) ? nsUser.roles : [])].filter(Boolean));
      const nsAuthorized = Boolean(nsUser) && ['Programador','Programador United','Programador Corellian'].some(function(role){return nsRoles.has(role);});
      const nsView = activateViewById('view-' + route);
      if(!nsView) return;
      setActiveSide(nsAuthorized ? route : '');
      updateContext(route, nsAuthorized ? 'Experimental NS · Fase 1 · Sin consultas de datos' : 'Experimental NS · Acceso restringido');
      if(!nsAuthorized){
        nsView.innerHTML = '<div class="expns-page"><section class="expns-card"><h1>Acceso restringido</h1><p>Experimental NS esta reservado temporalmente al rol Programador.</p></section></div>';
        return;
      }
      if(window.ManttoExperimentalNsF1 && typeof window.ManttoExperimentalNsF1.init === 'function'){
        window.ManttoExperimentalNsF1.init(route);
      }else{
        nsView.innerHTML = '<div class="expns-page"><section class="expns-card"><h1>Experimental NS</h1><p>Modulo no disponible. Recarga la pantalla.</p></section></div>';
      }
      return;
    }
'@
$router = Replace-Exactly-Once $router $anchor ($anchor + $routerNL + (Match-Newlines $routeHandler $routerNL)) 'manejo de rutas Experimental NS'

$files = @(
    'modules\experimental-ns\experimental-ns.js',
    'modules\experimental-ns\experimental-ns.css',
    'tests\experimental-ns-fase1.test.js',
    'docs\EXPERIMENTAL_NS_FASE1.md'
)
foreach($file in $files){
    if(-not (Test-Path -LiteralPath (Join-Path $work $file))){throw "Falta en ZIP: $file"}
    if(Test-Path -LiteralPath (Join-Path $REPO $file)){throw "El destino ya existe y NO se sobreescribira: $file"}
}

$preflightJs = Join-Path $work 'router-preflight.js'
[System.IO.File]::WriteAllText($preflightJs,$router,$utf8)
& node --check $preflightJs
if($LASTEXITCODE -ne 0){throw 'Fallo de sintaxis en el router generado. No se modifico el proyecto.'}
& node --check (Join-Path $work 'modules\experimental-ns\experimental-ns.js')
if($LASTEXITCODE -ne 0){throw 'Fallo de sintaxis en Experimental NS. No se modifico el proyecto.'}

$backup = Join-Path $env:USERPROFILE ('Downloads\BACKUP_EXPNS_F1_' + (Get-Date -Format 'yyyyMMdd_HHmmss'))
New-Item -ItemType Directory -Path $backup | Out-Null
Copy-Item -LiteralPath $indexPath -Destination (Join-Path $backup 'index.html')
Copy-Item -LiteralPath $routerPath -Destination (Join-Path $backup 'router.js')
$applyStarted = $false
try {
    $applyStarted = $true
    foreach($file in $files){
        $destination = Join-Path $REPO $file
        $parent = Split-Path -Parent $destination
        if(-not (Test-Path $parent)){New-Item -ItemType Directory -Path $parent -Force | Out-Null}
        Copy-Item -LiteralPath (Join-Path $work $file) -Destination $destination
    }
    [System.IO.File]::WriteAllText($indexPath,$index,$utf8)
    [System.IO.File]::WriteAllText($routerPath,$router,$utf8)
    & node --check $routerPath
    if($LASTEXITCODE -ne 0){throw 'El router modificado no supero node --check.'}
    & node --test (Join-Path $REPO 'tests\experimental-ns-fase1.test.js')
    if($LASTEXITCODE -ne 0){throw 'Fallaron los tests de Fase 1.'}
    & git -C $REPO diff --check
    if($LASTEXITCODE -ne 0){throw 'git diff --check detecto errores.'}
    Write-Host 'FASE 1 APLICADA LOCALMENTE Y VALIDADA. SIN COMMIT NI PUSH.' -ForegroundColor Green
    & git -C $REPO status --short
    & git -C $REPO diff --stat
    Write-Host "Respaldo: $backup"
} catch {
    if($applyStarted){
        Copy-Item -LiteralPath (Join-Path $backup 'index.html') -Destination $indexPath -Force
        Copy-Item -LiteralPath (Join-Path $backup 'router.js') -Destination $routerPath -Force
        foreach($file in $files){
            $destination = Join-Path $REPO $file
            if(Test-Path -LiteralPath $destination){Remove-Item -LiteralPath $destination -Force}
        }
    }
    throw
}
