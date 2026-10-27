# BLT NOW | Experimental NS | FASE 7 V001 | COPIAR Y PEGAR EN POWERSHELL LOCAL
# Requiere fases F1-F6. No ejecuta SQL, commit, push ni despliegue.
$ErrorActionPreference='Stop'
$REPO='C:\Users\T14s\Downloads\mantto_gestor_frontend'
$ZIP=Join-Path $env:USERPROFILE 'Downloads\EXPERIMENTAL_NS_FASE7_V001.zip'
if(!(Test-Path -LiteralPath $ZIP)){throw "No se encontro el ZIP F7 en Descargas."}
if(!(Test-Path -LiteralPath (Join-Path $REPO ".git"))){throw "No se encontro el repositorio local."}
$replace=[ordered]@{
  'modules/experimental-ns/experimental-ns.js'='555D8374FF93CAF2032749979401CF240F8F62C5E01A8CA2D7E58A47941D9CAA'
  'modules/experimental-ns/experimental-ns-live.js'='EAF2788E8DEC81EC2B9CF91485D84FF3359C244393CDABBC621193319C4FD1FA'
  'modules/experimental-ns/resumen-dia/resumen-dia-ns.js'='5D3F1C49AFD8A35DE588366479CF7BC130731189851D9700646142CA1E2881DB'
  'modules/experimental-ns/equipos-criticos/equipos-criticos-ns.js'='43C7A5BF52A9E3190816C32C232A2816CDEE483EC5C4ABAEAD50339A475BAC68'
  'modules/experimental-ns/proyectos-mantenimiento/proyectos-mantenimiento-ns.js'='3CBA0CFE342607E7F03E8154B460C6B83FCC85F9854CEE0267ABE0CDAF12C55E'
  'backend/tests/experimental-ns-fase3.test.js'='CBA0992ACE47D862A61621A8CA8725829E5DD08397648B08458F0792F1AC2ACA'
}
$create=@(
  'modules/experimental-ns/experimental-ns-protection.js',
  'modules/experimental-ns/experimental-ns-protection.css',
  'backend/tests/experimental-ns-fase7.test.js',
  'docs/EXPERIMENTAL_NS_FASE7.md',
  'docs/ADR_20261026_EXPNS_F7_BORRADORES_Y_CONFLICTOS.md'
)
$allFiles=@($replace.Keys)+$create
foreach($rel in $replace.Keys){
  $path=Join-Path $REPO $rel
  if(!(Test-Path -LiteralPath $path)){throw "Falta archivo F6: $rel"}
  $found=(Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash
  if($found -ne $replace[$rel]){throw "SHA256 distinto en: $rel. NO sobrescribimos cambios locales."}
}
foreach($rel in $create){
  if(Test-Path -LiteralPath (Join-Path $REPO $rel)){throw "F7 ya existe o hay un archivo previo: $rel"}
}
$tmp=Join-Path $env:TEMP ("EXPNS_F7_"+[guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $tmp | Out-Null
Expand-Archive -LiteralPath $ZIP -DestinationPath $tmp
foreach($rel in $allFiles){if(!(Test-Path -LiteralPath (Join-Path $tmp $rel))){throw "ZIP incompleto: $rel"}}
$manifest=Join-Path $tmp "CHECKSUMS_SHA256.txt"
if(!(Test-Path -LiteralPath $manifest)){throw "Falta manifest SHA256 del ZIP."}
foreach($entry in (Get-Content -LiteralPath $manifest -Encoding UTF8)){
  if($entry -notmatch '^([0-9a-fA-F]{64})\s{2}(.+)$'){throw 'Manifest de checksums invalido.'}
  $expect=$Matches[1].ToUpperInvariant();$rel=$Matches[2]
  $file=Join-Path $tmp $rel
  if(!(Test-Path -LiteralPath $file)){throw "Archivo faltante segun manifest: $rel"}
  if((Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash -ne $expect){throw "Checksum invalido: $rel"}
}
foreach($rel in $allFiles){
  if($rel.EndsWith('.js')){& node --check (Join-Path $tmp $rel);if($LASTEXITCODE -ne 0){throw "JS invalido: $rel"}}
}
$backup=Join-Path $env:USERPROFILE ('Downloads\BACKUP_EXPNS_F7_'+(Get-Date -Format 'yyyyMMdd_HHmmss'))
New-Item -ItemType Directory -Path $backup | Out-Null
foreach($rel in $replace.Keys){
  $dst=Join-Path $backup $rel;New-Item -ItemType Directory -Path (Split-Path -Parent $dst) -Force | Out-Null
  Copy-Item -LiteralPath (Join-Path $REPO $rel) -Destination $dst
}
$created=New-Object 'System.Collections.Generic.List[string]'
try{
  foreach($rel in $create){
    $dst=Join-Path $REPO $rel;New-Item -ItemType Directory -Path (Split-Path -Parent $dst) -Force | Out-Null
    $created.Add($dst);Copy-Item -LiteralPath (Join-Path $tmp $rel) -Destination $dst
  }
  foreach($rel in $replace.Keys){Copy-Item -LiteralPath (Join-Path $tmp $rel) -Destination (Join-Path $REPO $rel) -Force}
  $tests=@(
    (Join-Path $REPO 'backend/tests/experimental-ns-fase2.test.js'),
    (Join-Path $REPO 'backend/tests/experimental-ns-fase3.test.js'),
    (Join-Path $REPO 'backend/tests/experimental-ns-fase4.test.js'),
    (Join-Path $REPO 'backend/tests/experimental-ns-fase5.test.js'),
    (Join-Path $REPO 'backend/tests/experimental-ns-fase6.test.js'),
    (Join-Path $REPO 'backend/tests/experimental-ns-fase7.test.js')
  )
  & node --test @tests
  if($LASTEXITCODE -ne 0){throw "Pruebas F2-F7 fallidas; se restaura respaldo."}
  & node --test (Join-Path $REPO 'tests/experimental-ns-fase1.test.js')
  if($LASTEXITCODE -ne 0){throw "Pruebas F1 fallidas; se restaura respaldo."}
  & git -C $REPO diff --check
  if($LASTEXITCODE -ne 0){throw "git diff --check fallo; se restaura respaldo."}
  Write-Host 'EXPERIMENTAL NS FASE 7: APLICADA LOCALMENTE Y PRUEBAS OK' -ForegroundColor Green
  Write-Host "BACKUP: $backup"
  & git -C $REPO status --short
  & git -C $REPO diff --stat
}catch{
  foreach($rel in $replace.Keys){Copy-Item -LiteralPath (Join-Path $backup $rel) -Destination (Join-Path $REPO $rel) -Force}
  foreach($path in $created){if(Test-Path -LiteralPath $path){Remove-Item -LiteralPath $path -Force}}
  throw
}
