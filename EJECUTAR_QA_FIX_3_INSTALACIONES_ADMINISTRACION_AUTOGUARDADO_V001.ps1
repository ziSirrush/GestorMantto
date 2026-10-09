# [Aster | 2026-10-09 | ASTER-MG | FIX_3_INSTALACIONES_ADMINISTRACION_INTEGRACION_QA_AUTOGUARDADO_V001]
# Solo verificaciones locales, sintaxis y tests (mocks). No realiza escrituras remotas.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Push-Location $root
try {
  if (!(Get-Command node -ErrorAction SilentlyContinue)) {throw 'Se requiere Node.js para QA.'}
  $frontend='modules\instalaciones-administracion\instalaciones-administracion_cor.js'
  $service='backend\src\modules\instalaciones-administracion\instalaciones-administracion.service.js'
  $constants='backend\src\modules\instalaciones-administracion\instalaciones-administracion.constants.js'
  $sql='database\QA_FIX_3_INSTALACIONES_ADMINISTRACION_AUTOGUARDADO_SOLO_LECTURA_V001.sql'
  $smoke='validation\instalaciones-administracion-fix3-autoguardado-readonly.js'
  $index='index.html'
  $loader='core\module-loader.js'
  foreach ($p in @($frontend,$service,$constants,$sql,$smoke,$index,$loader)){
    if (!(Test-Path -LiteralPath $p -PathType Leaf)) {throw "Archivo requerido ausente: $p"}
  }
  $front=[System.IO.File]::ReadAllText((Join-Path $root $frontend),[System.Text.Encoding]::UTF8)
  $back=[System.IO.File]::ReadAllText((Join-Path $root $service),[System.Text.Encoding]::UTF8)
  if (!$front.Contains("VERSION_COR='20261009-autoguardado-fix3-qa-v001'") -or
      !$front.Contains('st.autoOriginal') -or !$back.Contains('ensureFullEditPermission_cor')){
    throw 'No estan aplicados correctamente los FIX 1, FIX 2 y FIX 3.'
  }
  $loaderText=[System.IO.File]::ReadAllText((Join-Path $root $loader),[System.Text.Encoding]::UTF8)
  $indexText=[System.IO.File]::ReadAllText((Join-Path $root $index),[System.Text.Encoding]::UTF8)
  $token='20261009-instalaciones-administracion-autoguardado-fix3-qa-v001'
  if (!$loaderText.Contains('instalaciones-administracion_cor.js?v='+$token) -or
      !$indexText.Contains('core/module-loader.js?v='+$token)){
    throw 'Falta aplicar ACTUALIZAR_CACHE_FIX_3_INSTALACIONES_ADMINISTRACION_AUTOGUARDADO_V001.ps1.'
  }
  & node --check $frontend
  if ($LASTEXITCODE -ne 0) {throw 'Error de sintaxis del frontend.'}
  & node --check $smoke
  if ($LASTEXITCODE -ne 0) {throw 'Error de sintaxis del smoke.'}
  & node --check $service
  if ($LASTEXITCODE -ne 0) {throw 'Error de sintaxis del backend.'}
  $tests=Get-ChildItem -Path (Join-Path $root 'tests') -Filter 'instalaciones-administracion-*.test.js' | Sort-Object Name | Select-Object -ExpandProperty FullName
  if (@($tests).Count -lt 5) {throw 'Faltan pruebas historicas del modulo. No declarar QA integral.'}
  & node --test $tests
  if ($LASTEXITCODE -ne 0) {throw 'Una o mas pruebas locales fallaron; detener promoción.'}
  if (Get-Command git -ErrorAction SilentlyContinue) {
    & git diff --check
    if ($LASTEXITCODE -ne 0) {throw 'git diff --check fallo.'}
  }
  Write-Host 'FIX3: pruebas locales con mocks aprobadas. QA real y E2E siguen pendientes.' -ForegroundColor Green
} finally { Pop-Location }
