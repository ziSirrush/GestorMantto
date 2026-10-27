# BLT NOW | EXPERIMENTAL NS | FASE 4 | COPIAR A POWERSHELL (LOCAL)
# Sin .patch, sin .ps1, sin SQL, sin commit/push ni despliegue.
$ErrorActionPreference='Stop'
$REPO='C:\Users\T14s\Downloads\mantto_gestor_frontend'
$ZIP=Join-Path $env:USERPROFILE 'Downloads\EXPERIMENTAL_NS_FASE4_V001.zip'
$utf8=New-Object System.Text.UTF8Encoding($false)
if(!(Test-Path -LiteralPath $ZIP)){throw 'No se encontro el ZIP de F4 en Descargas.'}
if(!(Test-Path -LiteralPath (Join-Path $REPO '.git'))){throw 'No se encontro el repositorio local.'}
$routes=Join-Path $REPO 'backend\src\routes\index.js'
$shell=Join-Path $REPO 'modules\experimental-ns\experimental-ns.js'
$required=@(
  'backend\src\modules\experimental-ns\experimental-ns.routes.js',
  'backend\src\modules\experimental-ns\experimental-ns-resumen-dia.routes.js',
  'backend\src\modules\experimental-ns\experimental-ns.scope.js',
  'modules\experimental-ns\resumen-dia\resumen-dia-ns.js'
)
foreach($file in $required){
  if(!(Test-Path -LiteralPath (Join-Path $REPO $file))){throw "Fases previas incompletas: $file"}
}
if(!(Test-Path -LiteralPath $routes) -or !(Test-Path -LiteralPath $shell)){throw 'Falta indice de rutas o shell Experimental NS.'}
# F4 modifica EXACTAMENTE la version completa de la agrupacion entregada en F3;
# aborta si alguien edito el archivo despues de F3.
$expectedShellHash='12B4D6970F230F3C773C82AC06FB6189026BC7FD925F16DFB572D80EE5099D6D'
$currentShellHash=(Get-FileHash -LiteralPath $shell -Algorithm SHA256).Hash
if($currentShellHash -ne $expectedShellHash){throw 'Shell Experimental NS no coincide con F3 V001. Abortado sin cambios.'}
$original=[System.IO.File]::ReadAllText($routes,[System.Text.Encoding]::UTF8)
$oldImport="const experimentalNsResumenDiaRoutes = require('../modules/experimental-ns/experimental-ns-resumen-dia.routes');"
$oldMount="router.use('/experimental-ns', experimentalNsResumenDiaRoutes);"
$newImport="const experimentalNsEquiposCriticosRoutes = require('../modules/experimental-ns/experimental-ns-equipos-criticos.routes');"
$newMount="router.use('/experimental-ns', experimentalNsEquiposCriticosRoutes);"
if(([regex]::Matches($original,[regex]::Escape($oldImport))).Count -ne 1 -or
   ([regex]::Matches($original,[regex]::Escape($oldMount))).Count -ne 1 -or
   $original.Contains($newImport) -or $original.Contains($newMount)){
  throw 'El indice de rutas no corresponde a F3 o F4 ya esta integrada. No sobrescribir.'
}
$nl=if($original.Contains("`r`n")){"`r`n"}else{"`n"}
$newRoutes=$original.Replace($oldImport,$oldImport+$nl+$newImport).Replace($oldMount,$oldMount+$nl+$newMount)
$files=@(
  'backend\src\modules\experimental-ns\experimental-ns-equipos-criticos.metrics.js',
  'backend\src\modules\experimental-ns\experimental-ns-equipos-criticos.repository.js',
  'backend\src\modules\experimental-ns\experimental-ns-equipos-criticos.service.js',
  'backend\src\modules\experimental-ns\experimental-ns-equipos-criticos.controller.js',
  'backend\src\modules\experimental-ns\experimental-ns-equipos-criticos.routes.js',
  'backend\tests\experimental-ns-fase4.test.js',
  'modules\experimental-ns\equipos-criticos\equipos-criticos-ns.js',
  'modules\experimental-ns\equipos-criticos\equipos-criticos-ns.css',
  'docs\EXPERIMENTAL_NS_FASE4.md'
)
$work=Join-Path $env:TEMP ('EXPNS_F4_'+[guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $work | Out-Null
Expand-Archive -LiteralPath $ZIP -DestinationPath $work
foreach($file in $files){
  if(!(Test-Path -LiteralPath (Join-Path $work $file))){throw "ZIP incompleto: $file"}
  if(Test-Path -LiteralPath (Join-Path $REPO $file)){throw "Archivo ya existe; abortado sin sobrescribir: $file"}
}
$nextShell=Join-Path $work 'modules\experimental-ns\experimental-ns.js'
if(!(Test-Path -LiteralPath $nextShell)){throw 'El ZIP no incluye shell completo.'}
if(([System.IO.File]::ReadAllText($nextShell,[System.Text.Encoding]::UTF8)).IndexOf('loadEquiposCriticosNS') -lt 0){
  throw 'Shell F4 incompleto.'
}
& git -C $REPO status --short
if($LASTEXITCODE -ne 0){throw 'No se pudo consultar el estado Git.'}
$backup=Join-Path $env:USERPROFILE ('Downloads\BACKUP_EXPNS_F4_'+(Get-Date -Format 'yyyyMMdd_HHmmss'))
New-Item -ItemType Directory -Path $backup | Out-Null
Copy-Item -LiteralPath $routes -Destination (Join-Path $backup 'backend-routes-index.js')
Copy-Item -LiteralPath $shell -Destination (Join-Path $backup 'experimental-ns.js')
$created=New-Object 'System.Collections.Generic.List[string]'
$wroteRoutes=$false
$wroteShell=$false
try {
  foreach($file in $files){
    $destination=Join-Path $REPO $file
    New-Item -ItemType Directory -Force -Path (Split-Path $destination -Parent) | Out-Null
    Copy-Item -LiteralPath (Join-Path $work $file) -Destination $destination
    $created.Add($destination)
  }
  [System.IO.File]::WriteAllText($routes,$newRoutes,$utf8)
  $wroteRoutes=$true
  Copy-Item -LiteralPath $nextShell -Destination $shell -Force
  $wroteShell=$true
  $checks=@($routes,$shell)+@($files | Where-Object { $_ -like '*.js' } | ForEach-Object { Join-Path $REPO $_ })
  foreach($f in $checks){& node --check $f;if($LASTEXITCODE -ne 0){throw "Fallo node --check en $f"}}
  & node --test (Join-Path $REPO 'backend\tests\experimental-ns-fase2.test.js') (Join-Path $REPO 'backend\tests\experimental-ns-fase3.test.js') (Join-Path $REPO 'backend\tests\experimental-ns-fase4.test.js')
  if($LASTEXITCODE -ne 0){throw 'Pruebas F2/F3/F4 no pasaron.'}
  & git -C $REPO diff --check
  if($LASTEXITCODE -ne 0){throw 'git diff --check fallo.'}
  Write-Host 'F4 VALIDADA LOCALMENTE. SIN COMMIT NI DESPLIEGUE.' -ForegroundColor Green
  & git -C $REPO status --short
  Write-Host "Respaldo: $backup"
} catch {
  if($wroteShell){Copy-Item -LiteralPath (Join-Path $backup 'experimental-ns.js') -Destination $shell -Force}
  if($wroteRoutes){Copy-Item -LiteralPath (Join-Path $backup 'backend-routes-index.js') -Destination $routes -Force}
  foreach($createdFile in $created){if(Test-Path -LiteralPath $createdFile){Remove-Item -LiteralPath $createdFile -Force}}
  throw
}
