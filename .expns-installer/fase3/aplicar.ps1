# BLT NOW | FASE 3 EXPERIMENTAL NS | SOLO LOCAL
# No ejecuta SQL, no hace git commit/push, no despliega.
$ErrorActionPreference='Stop'
$REPO='C:\Users\T14s\Downloads\mantto_gestor_frontend'
$ZIP=Join-Path $env:USERPROFILE 'Downloads\EXPERIMENTAL_NS_FASE3_V001.zip'
$utf8=New-Object System.Text.UTF8Encoding($false)
if(!(Test-Path -LiteralPath $ZIP)){throw 'ZIP de F3 no encontrado.'}
if(!(Test-Path -LiteralPath (Join-Path $REPO '.git'))){throw 'Repositorio local no encontrado.'}
$routes=Join-Path $REPO 'backend\src\routes\index.js'
$shell=Join-Path $REPO 'modules\experimental-ns\experimental-ns.js'
if(!(Test-Path -LiteralPath $routes) -or !(Test-Path -LiteralPath $shell)){throw 'Fases F1/F2 no identificadas.'}
if(!(Test-Path -LiteralPath (Join-Path $REPO 'backend\src\modules\experimental-ns\experimental-ns.routes.js'))){throw 'F2 no instalada.'}
& git -C $REPO status --short
if($LASTEXITCODE -ne 0){throw 'Error Git.'}
$files=@(
 'backend\src\modules\experimental-ns\experimental-ns-resumen-dia.service.js',
 'backend\src\modules\experimental-ns\experimental-ns-resumen-dia.controller.js',
 'backend\src\modules\experimental-ns\experimental-ns-resumen-dia.repository.js',
 'backend\src\modules\experimental-ns\experimental-ns-resumen-dia.routes.js',
 'backend\tests\experimental-ns-fase3.test.js',
 'modules\experimental-ns\resumen-dia\resumen-dia-ns.js',
 'modules\experimental-ns\resumen-dia\resumen-dia-ns.css',
 'docs\EXPERIMENTAL_NS_FASE3.md'
)
$work=Join-Path $env:TEMP ('EXPNS_F3_'+[guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $work | Out-Null
Expand-Archive -LiteralPath $ZIP -DestinationPath $work
foreach($file in $files){
 if(!(Test-Path -LiteralPath (Join-Path $work $file))){throw "Incompleto: $file"}
 if(Test-Path -LiteralPath (Join-Path $REPO $file)){throw "El archivo ya existe; abortado sin sobrescribir: $file"}
}
$original=[System.IO.File]::ReadAllText($routes,[System.Text.Encoding]::UTF8)
$oldShell=[System.IO.File]::ReadAllText($shell,[System.Text.Encoding]::UTF8)
$newShell=[System.IO.File]::ReadAllText((Join-Path $work 'modules\experimental-ns\experimental-ns.js'),[System.Text.Encoding]::UTF8)
if(!$oldShell.Contains('window.ManttoExperimentalNsF1') -or $oldShell.Contains('loadResumenDiaNS')){throw 'Shell F1 no coincide o F3 ya aplicada. No sobreescribir.'}
if(!$original.Contains("router.use('/experimental-ns', experimentalNsRoutes);") -or $original.Contains('experimentalNsResumenDiaRoutes')){throw 'No se encuentra montaje F2 esperado o F3 ya aplicada.'}
$import="const experimentalNsRoutes = require('../modules/experimental-ns/experimental-ns.routes');"
$mount="router.use('/experimental-ns', experimentalNsRoutes);"
if(([regex]::Matches($original,[regex]::Escape($import))).Count -ne 1 -or ([regex]::Matches($original,[regex]::Escape($mount))).Count -ne 1){throw 'Marcadores ambiguos; abortado.'}
$nl=if($original.Contains("`r`n")){"`r`n"}else{"`n"}
$newRoutes=$original.Replace($import,$import+$nl+"const experimentalNsResumenDiaRoutes = require('../modules/experimental-ns/experimental-ns-resumen-dia.routes');").Replace($mount,$mount+$nl+"router.use('/experimental-ns', experimentalNsResumenDiaRoutes);")
$backup=Join-Path $env:USERPROFILE ('Downloads\BACKUP_EXPNS_F3_'+(Get-Date -Format 'yyyyMMdd_HHmmss'))
New-Item -ItemType Directory -Path $backup | Out-Null
Copy-Item -LiteralPath $routes -Destination (Join-Path $backup 'backend-routes-index.js')
Copy-Item -LiteralPath $shell -Destination (Join-Path $backup 'experimental-ns.js')
$didWrite=$false
try {
 foreach($file in $files){
  $dest=Join-Path $REPO $file
  New-Item -ItemType Directory -Force -Path (Split-Path $dest -Parent) | Out-Null
  Copy-Item -LiteralPath (Join-Path $work $file) -Destination $dest
 }
 $didWrite=$true
 [System.IO.File]::WriteAllText($routes,$newRoutes,$utf8)
 [System.IO.File]::WriteAllText($shell,$newShell,$utf8)
 foreach($file in @($routes,$shell)+@($files | Where-Object {$_ -like '*.js'} | ForEach-Object{Join-Path $REPO $_})){& node --check $file;if($LASTEXITCODE -ne 0){throw "Sintaxis invalida: $file"}}
 & node --test (Join-Path $REPO 'backend\tests\experimental-ns-fase2.test.js') (Join-Path $REPO 'backend\tests\experimental-ns-fase3.test.js')
 if($LASTEXITCODE -ne 0){throw 'Pruebas F2+F3 fallaron.'}
 & git -C $REPO diff --check
 if($LASTEXITCODE -ne 0){throw 'git diff --check fallo.'}
 Write-Host 'FASE 3 VALIDADA LOCALMENTE. SIN PUBLICACION.' -ForegroundColor Green
 & git -C $REPO status --short
 Write-Host "Respaldo: $backup"
} catch {
 if($didWrite){
  Copy-Item -LiteralPath (Join-Path $backup 'backend-routes-index.js') -Destination $routes -Force
  Copy-Item -LiteralPath (Join-Path $backup 'experimental-ns.js') -Destination $shell -Force
 }
 foreach($file in $files){$dest=Join-Path $REPO $file;if(Test-Path -LiteralPath $dest){Remove-Item -LiteralPath $dest -Force}}
 throw
}
