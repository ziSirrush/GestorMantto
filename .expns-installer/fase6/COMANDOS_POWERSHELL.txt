# BLT NOW | EXPERIMENTAL NS | FASE 6 | PEGAR EN POWERSHELL (LOCAL)
# Depende de F1-F5 aplicadas. No ejecuta commit, push, SQL, Azure ni NetSuite.
# No .patch ni instaladores. Aborta al detectar versiones locales distintas.
$ErrorActionPreference='Stop'
$REPO='C:\Users\T14s\Downloads\mantto_gestor_frontend'
$ZIP=Join-Path $env:USERPROFILE 'Downloads\EXPERIMENTAL_NS_FASE6_V001.zip'
$utf8=New-Object System.Text.UTF8Encoding($false)
if(!(Test-Path -LiteralPath $ZIP)){throw 'No se encontro el ZIP F6 en Descargas.'}
if(!(Test-Path -LiteralPath (Join-Path $REPO '.git'))){throw 'No se encontro el repositorio local.'}
$pathsToReplace=[ordered]@{
  'modules/experimental-ns/experimental-ns.js'='3B591787949480F11ABF6155C19BB11B243E28F880C8511A4460CCFFBD275F67'
  'modules/experimental-ns/experimental-ns.css'='6455776DABC2109319F386459446D5D5CC6595530D7D8EFAA8B1DE52823F0536'
  'modules/experimental-ns/resumen-dia/resumen-dia-ns.js'='17BE30F13AC7D818AA37136C0C505537A84B8C1C8A09C14791C1D27409CB42E7'
  'modules/experimental-ns/equipos-criticos/equipos-criticos-ns.js'='8B8B0B2D46FB7DD0777FA9D4D0C5B9F45563BDA57447F827B9DFFE6B1920D54C'
  'modules/experimental-ns/proyectos-mantenimiento/proyectos-mantenimiento-ns.js'='50C049F30272BF24A0710986BEF3CFB7A276BFA9208A63EAE469415B2B79BF79'
  'backend/tests/experimental-ns-fase3.test.js'='A9CC39324AC60D574A4EC393F1219DA91DF4F452DF14F08DDC8AEBA50EAB25C7'
}
$pathsToCreate=@(
  'backend/src/modules/experimental-ns/experimental-ns-live.repository.js',
  'backend/src/modules/experimental-ns/experimental-ns-live.routes.js',
  'modules/experimental-ns/experimental-ns-live.js',
  'backend/tests/experimental-ns-fase6.test.js',
  'docs/EXPERIMENTAL_NS_FASE6.md',
  'docs/ADR_20261026_EXPNS_F6_PILOTO_SYNC.md'
)
$routesRel='backend/src/routes/index.js'
$routes=Join-Path $REPO $routesRel
if(!(Test-Path -LiteralPath $routes)){throw 'Falta backend/src/routes/index.js'}
foreach($rel in $pathsToReplace.Keys){
  $dest=Join-Path $REPO $rel
  if(!(Test-Path -LiteralPath $dest)){throw "Falta requisito F1-F5: $rel"}
  $found=(Get-FileHash -LiteralPath $dest -Algorithm SHA256).Hash
  if($found -ne $pathsToReplace[$rel]){throw "Archivo F1-F5 distinto: $rel. Abortado para no sobrescribir cambios locales."}
}
foreach($rel in $pathsToCreate){
  if(Test-Path -LiteralPath (Join-Path $REPO $rel)){throw "La fase 6 ya existe o hay un archivo previo: $rel"}
}
$routesOriginal=[System.IO.File]::ReadAllText($routes,[System.Text.Encoding]::UTF8)
$oldImport="const experimentalNsProyectosMantenimientoRoutes = require('../modules/experimental-ns/experimental-ns-proyectos-mantenimiento.routes');"
$oldMount="router.use('/experimental-ns', experimentalNsProyectosMantenimientoRoutes);"
$newImport="const experimentalNsLiveRoutes = require('../modules/experimental-ns/experimental-ns-live.routes');"
$newMount="router.use('/experimental-ns', experimentalNsLiveRoutes);"
foreach($marker in @($oldImport,$oldMount)){
  if(([regex]::Matches($routesOriginal,[regex]::Escape($marker))).Count -ne 1){
    throw "Marcador F5 faltante/duplicado en index.js. Abortado: $marker"
  }
}
if($routesOriginal.Contains($newImport) -or $routesOriginal.Contains($newMount)){throw 'F6 ya registrada. No aplicar dos veces.'}
$nl=if($routesOriginal.Contains("`r`n")){"`r`n"}else{"`n"}
$routesNext=$routesOriginal.Replace($oldImport,$oldImport+$nl+$newImport).Replace($oldMount,$oldMount+$nl+$newMount)
$work=Join-Path $env:TEMP ('EXPNS_F6_'+[guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $work | Out-Null
Expand-Archive -LiteralPath $ZIP -DestinationPath $work
$allFiles=@($pathsToReplace.Keys)+$pathsToCreate
foreach($rel in $allFiles){
  if(!(Test-Path -LiteralPath (Join-Path $work $rel))){throw "ZIP incompleto: $rel"}
}
$preflight=Join-Path $work 'index-F6-preflight.js'
[System.IO.File]::WriteAllText($preflight,$routesNext,$utf8)
foreach($rel in $allFiles){
  if($rel -like '*.js'){
    & node --check (Join-Path $work $rel)
    if($LASTEXITCODE -ne 0){throw "Error de sintaxis en ZIP: $rel"}
  }
}
& node --check $preflight
if($LASTEXITCODE -ne 0){throw 'Error de sintaxis en index.js previsto; repo intacto.'}
$backup=Join-Path $env:USERPROFILE ('Downloads\BACKUP_EXPNS_F6_'+(Get-Date -Format 'yyyyMMdd_HHmmss'))
New-Item -ItemType Directory -Path $backup | Out-Null
foreach($rel in (@($pathsToReplace.Keys)+@($routesRel))){
  $backDest=Join-Path $backup $rel
  New-Item -ItemType Directory -Path (Split-Path -Parent $backDest) -Force | Out-Null
  Copy-Item -LiteralPath (Join-Path $REPO $rel) -Destination $backDest
}
$created=New-Object 'System.Collections.Generic.List[string]'
$started=$false
try{
  $started=$true
  foreach($rel in $pathsToCreate){
    $dest=Join-Path $REPO $rel
    New-Item -ItemType Directory -Path (Split-Path -Parent $dest) -Force | Out-Null
    Copy-Item -LiteralPath (Join-Path $work $rel) -Destination $dest
    $created.Add($dest)
  }
  foreach($rel in $pathsToReplace.Keys){
    Copy-Item -LiteralPath (Join-Path $work $rel) -Destination (Join-Path $REPO $rel) -Force
  }
  [System.IO.File]::WriteAllText($routes,$routesNext,$utf8)
  & node --check $routes
  if($LASTEXITCODE -ne 0){throw 'Error de sintaxis backend index local.'}
  & node --test (Join-Path $REPO 'backend/tests/experimental-ns-fase2.test.js') `
    (Join-Path $REPO 'backend/tests/experimental-ns-fase3.test.js') `
    (Join-Path $REPO 'backend/tests/experimental-ns-fase4.test.js') `
    (Join-Path $REPO 'backend/tests/experimental-ns-fase5.test.js') `
    (Join-Path $REPO 'backend/tests/experimental-ns-fase6.test.js')
  if($LASTEXITCODE -ne 0){throw 'Regresion F2-F6 fallida; se revierte.'}
  & node --test (Join-Path $REPO 'tests/experimental-ns-fase1.test.js')
  if($LASTEXITCODE -ne 0){throw 'Regresion F1 fallida; se revierte.'}
  & git -C $REPO diff --check
  if($LASTEXITCODE -ne 0){throw 'git diff --check fallido; se revierte.'}
  Write-Host 'FASE 6 APLICADA Y VALIDADA LOCALMENTE. SIN DEPLOY NI COMMIT.' -ForegroundColor Green
  Write-Host "Respaldo: $backup"
  & git -C $REPO status --short
  & git -C $REPO diff --stat
}catch{
  if($started){
    foreach($rel in (@($pathsToReplace.Keys)+@($routesRel))){
      Copy-Item -LiteralPath (Join-Path $backup $rel) -Destination (Join-Path $REPO $rel) -Force
    }
    foreach($file in $created){if(Test-Path -LiteralPath $file){Remove-Item -LiteralPath $file -Force}}
  }
  throw
}
