# BLT NOW | EXPERIMENTAL NS | FASE 5 | PEGAR EN POWERSHELL LOCAL
# NO .patch, NO .ps1, NO commit/push/SQL/Deploy. F1-F4 requeridas.
$ErrorActionPreference='Stop'
$REPO='C:\Users\T14s\Downloads\mantto_gestor_frontend'
$ZIP=Join-Path $env:USERPROFILE 'Downloads\EXPERIMENTAL_NS_FASE5_V001.zip'
$utf8=New-Object System.Text.UTF8Encoding($false)
if(!(Test-Path -LiteralPath $ZIP)){throw 'Falta ZIP F5 en Descargas.'}
if(!(Test-Path -LiteralPath (Join-Path $REPO '.git'))){throw 'No existe el repo local.'}
$routes=Join-Path $REPO 'backend\src\routes\index.js'
$shell=Join-Path $REPO 'modules\experimental-ns\experimental-ns.js'
$f1Tests=Join-Path $REPO 'tests\experimental-ns-fase1.test.js'
foreach($file in @(
  'index.html','core\router.js',
  'backend\src\modules\experimental-ns\experimental-ns.scope.js',
  'backend\src\modules\experimental-ns\experimental-ns-resumen-dia.routes.js',
  'backend\src\modules\experimental-ns\experimental-ns-equipos-criticos.routes.js',
  'backend\tests\experimental-ns-fase2.test.js',
  'backend\tests\experimental-ns-fase3.test.js',
  'backend\tests\experimental-ns-fase4.test.js',
  'modules\experimental-ns\resumen-dia\resumen-dia-ns.js',
  'modules\experimental-ns\equipos-criticos\equipos-criticos-ns.js',
  'tests\experimental-ns-fase1.test.js')){
  if(!(Test-Path -LiteralPath (Join-Path $REPO $file))){throw "Prerrequisito F1-F4 faltante: $file"}
}
if(!(Test-Path -LiteralPath $routes) -or !(Test-Path -LiteralPath $shell)){throw 'Falta indice de rutas o shell.'}
# Se sobrescriben SOLAMENTE versiones que coinciden con los entregables oficiales previos.
$expectedShellHash='B70D5DF2F5F4006BDAD398BCC7B1C984A6E0F105312E23B85E3E85E74E5A877F'
$expectedF1TestHash='B10E8304A60BBF65FEA8521CFAD631EBAA07CD9A38DCE6BF7D66F98ADD8DD484'
if((Get-FileHash -LiteralPath $shell -Algorithm SHA256).Hash -ne $expectedShellHash){throw 'Shell F4 diferente: F5 NO aplica para evitar sobrescritura.'}
if((Get-FileHash -LiteralPath $f1Tests -Algorithm SHA256).Hash -ne $expectedF1TestHash){throw 'Pruebas F1 diferentes: F5 NO aplica para evitar sobrescritura.'}
$original=[System.IO.File]::ReadAllText($routes,[System.Text.Encoding]::UTF8)
$oldImport="const experimentalNsEquiposCriticosRoutes = require('../modules/experimental-ns/experimental-ns-equipos-criticos.routes');"
$oldMount="router.use('/experimental-ns', experimentalNsEquiposCriticosRoutes);"
$newImport="const experimentalNsProyectosMantenimientoRoutes = require('../modules/experimental-ns/experimental-ns-proyectos-mantenimiento.routes');"
$newMount="router.use('/experimental-ns', experimentalNsProyectosMantenimientoRoutes);"
if(([regex]::Matches($original,[regex]::Escape($oldImport))).Count -ne 1 -or
   ([regex]::Matches($original,[regex]::Escape($oldMount))).Count -ne 1 -or
   $original.Contains($newImport) -or $original.Contains($newMount)){
  throw 'El indice de rutas no corresponde a F4 o F5 ya esta presente. NO se modifica.'
}
$nl=if($original.Contains("`r`n")){"`r`n"}else{"`n"}
$newRoutes=$original.Replace($oldImport,$oldImport+$nl+$newImport).Replace($oldMount,$oldMount+$nl+$newMount)
$filesNew=@(
  'backend\src\modules\experimental-ns\experimental-ns-proyectos-mantenimiento.repository.js',
  'backend\src\modules\experimental-ns\experimental-ns-proyectos-mantenimiento.metrics.js',
  'backend\src\modules\experimental-ns\experimental-ns-proyectos-mantenimiento.service.js',
  'backend\src\modules\experimental-ns\experimental-ns-proyectos-mantenimiento.controller.js',
  'backend\src\modules\experimental-ns\experimental-ns-proyectos-mantenimiento.routes.js',
  'backend\tests\experimental-ns-fase5.test.js',
  'modules\experimental-ns\proyectos-mantenimiento\proyectos-mantenimiento-ns.js',
  'modules\experimental-ns\proyectos-mantenimiento\proyectos-mantenimiento-ns.css',
  'docs\EXPERIMENTAL_NS_FASE5.md'
)
$work=Join-Path $env:TEMP ('EXPNS_F5_'+[guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $work | Out-Null
Expand-Archive -LiteralPath $ZIP -DestinationPath $work
foreach($file in $filesNew){
  if(!(Test-Path -LiteralPath (Join-Path $work $file))){throw "ZIP incompleto: $file"}
  if(Test-Path -LiteralPath (Join-Path $REPO $file)){throw "Archivo F5 ya existe: $file. Abortado sin cambios."}
}
$nextShell=Join-Path $work 'modules\experimental-ns\experimental-ns.js'
$nextF1Tests=Join-Path $work 'tests\experimental-ns-fase1.test.js'
if(!(Test-Path -LiteralPath $nextShell) -or !(Test-Path -LiteralPath $nextF1Tests)){throw 'ZIP F5 sin archivos completos de sustitucion.'}
if(!([System.IO.File]::ReadAllText($nextShell,[System.Text.Encoding]::UTF8)).Contains('loadProyectosMantenimientoNS')){throw 'Shell F5 no registrado.'}
# Preflight sintactico ANTES de tocar el repo.
$routesCheck=Join-Path $work 'backend-routes-f5-preflight.js'
[System.IO.File]::WriteAllText($routesCheck,$newRoutes,$utf8)
foreach($js in (@($routesCheck,$nextShell,$nextF1Tests)+@($filesNew | Where-Object {$_ -like '*.js'} | ForEach-Object {Join-Path $work $_}))){
  & node --check $js
  if($LASTEXITCODE -ne 0){throw "Error de sintaxis preflight: $js"}
}
# Las pruebas F5 con mocks NO se ejecutan aun aqui: requieren F2-F4 instaladas.
$backup=Join-Path $env:USERPROFILE ('Downloads\BACKUP_EXPNS_F5_'+(Get-Date -Format 'yyyyMMdd_HHmmss'))
New-Item -ItemType Directory -Path $backup | Out-Null
Copy-Item -LiteralPath $routes -Destination (Join-Path $backup 'backend-routes-index.js')
Copy-Item -LiteralPath $shell -Destination (Join-Path $backup 'experimental-ns.js')
Copy-Item -LiteralPath $f1Tests -Destination (Join-Path $backup 'experimental-ns-fase1.test.js')
$created=New-Object 'System.Collections.Generic.List[string]'
$startedRoutes=$false;$startedShell=$false;$startedTests=$false
try{
  foreach($file in $filesNew){
    $destination=Join-Path $REPO $file
    New-Item -ItemType Directory -Path (Split-Path $destination -Parent) -Force | Out-Null
    Copy-Item -LiteralPath (Join-Path $work $file) -Destination $destination
    $created.Add($destination)
  }
  [System.IO.File]::WriteAllText($routes,$newRoutes,$utf8);$startedRoutes=$true
  Copy-Item -LiteralPath $nextShell -Destination $shell -Force;$startedShell=$true
  Copy-Item -LiteralPath $nextF1Tests -Destination $f1Tests -Force;$startedTests=$true
  foreach($js in (@($routes,$shell,$f1Tests)+@($filesNew | Where-Object {$_ -like '*.js'} | ForEach-Object {Join-Path $REPO $_}))){
    & node --check $js
    if($LASTEXITCODE -ne 0){throw "Fallo node --check: $js"}
  }
  & node --test (Join-Path $REPO 'tests\experimental-ns-fase1.test.js')
  if($LASTEXITCODE -ne 0){throw 'Regresion de navegacion F1-F5.'}
  & node --test (Join-Path $REPO 'backend\tests\experimental-ns-fase2.test.js') (Join-Path $REPO 'backend\tests\experimental-ns-fase3.test.js') (Join-Path $REPO 'backend\tests\experimental-ns-fase4.test.js') (Join-Path $REPO 'backend\tests\experimental-ns-fase5.test.js')
  if($LASTEXITCODE -ne 0){throw 'Fallaron pruebas integrales F2-F5.'}
  & git -C $REPO diff --check
  if($LASTEXITCODE -ne 0){throw 'git diff --check fallo; se restaura backup.'}
  Write-Host 'FASE 5 VALIDADA EN LOCAL. SIN COMMIT/PUSH/AZURE/AIVEN.' -ForegroundColor Green
  & git -C $REPO status --short
  & git -C $REPO diff --stat
  Write-Host "Respaldo reversible: $backup"
  Write-Host 'Pendiente QA HTTP real con cuenta autorizada y datos reales NS.'
}catch{
  if($startedTests){Copy-Item -LiteralPath (Join-Path $backup 'experimental-ns-fase1.test.js') -Destination $f1Tests -Force}
  if($startedShell){Copy-Item -LiteralPath (Join-Path $backup 'experimental-ns.js') -Destination $shell -Force}
  if($startedRoutes){Copy-Item -LiteralPath (Join-Path $backup 'backend-routes-index.js') -Destination $routes -Force}
  foreach($createdFile in $created){if(Test-Path -LiteralPath $createdFile){Remove-Item -LiteralPath $createdFile -Force}}
  throw
}
