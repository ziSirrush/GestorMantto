# BLT NOW | Experimental NS | FASE 8 V001 | COMANDOS PowerShell (LOCAL)
# Requiere Node.js >= 18, Git, fases F1-F7 aplicadas en orden.
# No despliega, no hace commit/push ni ejecuta SQL.
$ErrorActionPreference='Stop'
$REPO='C:\Users\T14s\Downloads\mantto_gestor_frontend'
$ZIP=Join-Path $env:USERPROFILE 'Downloads\EXPERIMENTAL_NS_FASE8_V001.zip'
if(!(Test-Path -LiteralPath $ZIP)){throw "No se encontro el ZIP F8 en Descargas."}
if(!(Test-Path -LiteralPath (Join-Path $REPO ".git"))){throw "No se encontro el repositorio local."}
$replace=[ordered]@{
  'backend/src/modules/experimental-ns/experimental-ns-live.routes.js'='C12166699B002EDED468029A8416691472E26329BA195AC4609AA03D35A48FB2'
  'backend/tests/experimental-ns-fase3.test.js'='5EE4967079153C007004F1EA54A6C6B479CDAF4622774A676B62067A6F040EC8'
  'modules/experimental-ns/experimental-ns.js'='819BCAB6BC3A7D089C4164EDD65D315F9488E10A5359C49CB952A3F1C76B9D9C'
  'modules/experimental-ns/experimental-ns-live.js'='42F9D1088F33377949C7E8CA856C4557580FCFA91B24E18D7921BF6BF09722C2'
  'modules/experimental-ns/resumen-dia/resumen-dia-ns.js'='1AF1F6D1A8AA5087AD9A82CBC112B74EDF9FD16D6155C7302CD774587D890272'
  'modules/experimental-ns/equipos-criticos/equipos-criticos-ns.js'='A6D33C937C9F268DFB81B661A43007DADD6A860DCBEFB05F57A68B4ACCD125FA'
  'modules/experimental-ns/proyectos-mantenimiento/proyectos-mantenimiento-ns.js'='27A1848BA6954B7492774D5B393ACB0011BDE343E6FA96F8BC483331667C9956'
}
$create=@(
  'backend/src/modules/experimental-ns/experimental-ns-live-coalescer.js',
  'backend/tests/experimental-ns-fase8.test.js',
  'modules/experimental-ns/experimental-ns-performance.js',
  'modules/experimental-ns/experimental-ns-performance.css',
  'scripts/experimental-ns/bench-fase8-local.js',
  'docs/EXPERIMENTAL_NS_FASE8.md',
  'docs/ADR_20261026_EXPNS_F8_OPTIMIZACION.md',
  'docs/EXPERIMENTAL_NS_FASE8_RESULTADOS_SIMULADOS.md'
)
$allFiles=@($replace.Keys)+$create
foreach($rel in $replace.Keys){
  $path=Join-Path $REPO $rel
  if(!(Test-Path -LiteralPath $path)){throw "Falta archivo de fase previa: $rel"}
  if((Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash -ne $replace[$rel]){throw "SHA256 distinto en: $rel. No se sobrescribe."}
}
foreach($rel in $create){if(Test-Path -LiteralPath (Join-Path $REPO $rel)){throw "Archivo F8 ya existe: $rel"}}
$tmp=Join-Path $env:TEMP ("EXPNS_F8_"+[guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $tmp | Out-Null
Expand-Archive -LiteralPath $ZIP -DestinationPath $tmp
foreach($rel in $allFiles){if(!(Test-Path -LiteralPath (Join-Path $tmp $rel))){throw "ZIP incompleto: $rel"}}
$manifest=Join-Path $tmp "CHECKSUMS_SHA256.txt"
if(!(Test-Path -LiteralPath $manifest)){throw "Falta manifest SHA256 del ZIP"}
foreach($entry in (Get-Content -LiteralPath $manifest -Encoding UTF8)){
  if($entry -notmatch '^([0-9a-fA-F]{64})\s{2}(.+)$'){throw 'Manifest SHA256 invalido'}
  $expected=$Matches[1].ToUpperInvariant();$rel=$Matches[2]
  $file=Join-Path $tmp $rel
  if(!(Test-Path -LiteralPath $file)){throw "Archivo en manifest inexistente: $rel"}
  if((Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash -ne $expected){throw "Checksum incorrecto: $rel"}
}
foreach($rel in $allFiles){
  if($rel.EndsWith('.js')){& node --check (Join-Path $tmp $rel);if($LASTEXITCODE -ne 0){throw "Error de sintaxis: $rel"}}
}
$backup=Join-Path $env:USERPROFILE ('Downloads\BACKUP_EXPNS_F8_'+(Get-Date -Format 'yyyyMMdd_HHmmss'))
New-Item -ItemType Directory -Path $backup | Out-Null
foreach($rel in $replace.Keys){
  $dst=Join-Path $backup $rel
  New-Item -ItemType Directory -Path (Split-Path -Parent $dst) -Force | Out-Null
  Copy-Item -LiteralPath (Join-Path $REPO $rel) -Destination $dst
}
$created=New-Object 'System.Collections.Generic.List[string]'
try{
  foreach($rel in $create){
    $dst=Join-Path $REPO $rel
    New-Item -ItemType Directory -Path (Split-Path -Parent $dst) -Force | Out-Null
    $created.Add($dst)
    Copy-Item -LiteralPath (Join-Path $tmp $rel) -Destination $dst
  }
  foreach($rel in $replace.Keys){Copy-Item -LiteralPath (Join-Path $tmp $rel) -Destination (Join-Path $REPO $rel) -Force}
  $tests=@(
    (Join-Path $REPO 'backend/tests/experimental-ns-fase2.test.js'),
    (Join-Path $REPO 'backend/tests/experimental-ns-fase3.test.js'),
    (Join-Path $REPO 'backend/tests/experimental-ns-fase4.test.js'),
    (Join-Path $REPO 'backend/tests/experimental-ns-fase5.test.js'),
    (Join-Path $REPO 'backend/tests/experimental-ns-fase6.test.js'),
    (Join-Path $REPO 'backend/tests/experimental-ns-fase7.test.js'),
    (Join-Path $REPO 'backend/tests/experimental-ns-fase8.test.js')
  )
  & node --test @tests
  if($LASTEXITCODE -ne 0){throw "Pruebas F2-F8 fallidas; se restaura respaldo"}
  & node --test (Join-Path $REPO "tests/experimental-ns-fase1.test.js")
  if($LASTEXITCODE -ne 0){throw "Pruebas F1 fallidas; se restaura respaldo"}
  & git -C $REPO diff --check
  if($LASTEXITCODE -ne 0){throw "git diff --check fallo; se restaura respaldo"}
  Write-Host "EXPERIMENTAL NS FASE 8 APLICADA LOCALMENTE; SINTAXIS Y TESTS OK" -ForegroundColor Green
  Write-Host "Respaldo: $backup"
  & git -C $REPO status --short
  & git -C $REPO diff --stat
}catch{
  foreach($rel in $replace.Keys){Copy-Item -LiteralPath (Join-Path $backup $rel) -Destination (Join-Path $REPO $rel) -Force}
  foreach($file in $created){if(Test-Path -LiteralPath $file){Remove-Item -LiteralPath $file -Force}}
  throw
}finally{
  if(Test-Path -LiteralPath $tmp){Remove-Item -LiteralPath $tmp -Recurse -Force}
}
# Opcional y SEGURO: benchmark sintético con HTTP solo en 127.0.0.1:
# & node (Join-Path $REPO 'scripts/experimental-ns/bench-fase8-local.js')
# No iniciar carga real contra Azure/Aiven sin autorizacion.
