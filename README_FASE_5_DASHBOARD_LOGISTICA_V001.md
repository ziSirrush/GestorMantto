# BLT NOW / Gestor — Fase 5 de 5: Dashboard Logística V001

**Fecha:** 21/10/2026. **Alcance:** interfaz del Simulador de Fletes, integración de período y regresión F1–F4.  
**Fuente de verdad consultada:** GitHub `ziSirrush/GestorMantto`, `main` en commit `48d87594d5139c4fa911ef4a4abd794a705299c4` (`Version 102126.1`).  
**Base inmediata:** archivo frontend completo entregado en el **ZIP de Fase 3**; **motor/backend requerido:** ZIP de **Fase 4**. No se afirma que F1–F4 estén aplicadas en `main` ni en producción.

## Causa y solución

La Fase 4 añadió `GET /api/logistica/dashboard/simulacion`, pero no una interfaz para introducir rutas, pedir estimaciones y visualizar los escenarios. Esta Fase 5 añade exclusivamente la experiencia de usuario; **los cálculos estadísticos siguen en el backend** y las rutas consultan Aiven `log_ops` a través del Guard CORELLIAN existente.

- Formulario: partir desde **fecha EXW o fecha de zarpe**, con puerto de origen, puerto de destino, modo ICT y **lugar de entrega opcional**. Sugerencias de rutas a partir de `tablas.promedios_por_ruta` del período vigente (no restringe texto a esas opciones).
- Al calcular: línea de tiempo con fechas de **zarpe, llegada a puerto y entrega en obra**; desde EXW incluye además fecha EXW. Fechas de salida en `DD/MM/AAAA`, días de cada tramo y total.
- **Optimista (P25), promedio y conservador (P75)** provenientes del motor F4. Con menos de 10 operaciones completas solo se presenta promedio. Sin datos se indica explícitamente y **no se inventan fechas**.
- Selector **Período de análisis**: año actual, histórico o `Todos los años` controla también la simulación. **Tras buscar un nuevo año se recalcula automáticamente la simulación anterior**, conservando campos introducidos. En refrescos ocurre lo mismo. Año del simulador = año de `fecha_salida_real`.
- Mensajes claros sobre muestra, falta de datos, errores HTTP 400/422, ausencia de F4, respuesta de otro período y advertencias (puerto→obra incluye esperas de aduana/almacenamiento, no solo carretera).
- Validación local de fechas existentes y parámetros; la validación real permanece en backend. Se invalidan resultados anteriores al cambiar entradas o año; las respuestas tardías no sustituyen el período actual.
- Se conservan **F1** (estatus anterior/nuevo y acordeón sin PP NS), **F2/F3** (tabla consolidada y contenedores por período), gráficas, cortes semanales y detalles.
- CSS original del Dashboard **sin alterar**: se incorpora hoja nueva aislada para el simulador, responsive móvil/PWA.

## Archivos completos (solo nuevos/modificados)

```text
modules/dashboard-logistica/dashboard-logistica.js
modules/dashboard-logistica/dashboard-logistica-simulador.css   [NUEVO]
core/module-loader.js                                          [REFERENCIA completa]
tests/logistica_dashboard_fase1_movimientos_acordeon.test.js    [ajuste de verificación de cache-bust]
tests/logistica_dashboard_fase3_rutas_contenedores_periodo.test.js [ajuste de verificación de cache-bust]
tests/logistica_dashboard_fase5_simulador_frontend.test.js      [NUEVO]
README_FASE_5_DASHBOARD_LOGISTICA_V001.md
```

Los dos tests previos solo actualizan el **identificador de versión esperado** (de Fase 3 a Fase 5). No cambian los casos de prueba previos. **No se incluye código backend, SQL, `.patch` ni instaladores.** El loader completo se incluye por trazabilidad, pero el procedimiento local modifica **solo la entrada de `logistica-dashboard`** para no sobreescribir otros cambios.

## Aplicación local — PowerShell (sin commit, push ni publicación)

> Requisitos: Fases 1, 2, 3 y 4 **aplicadas previamente** en el repositorio local. Verifica antes de sobrescribir: si algún hash no coincide, **NO se aplica** y deben integrarse las diferencias manualmente. Los archivos del ZIP no modifican los sistemas externos.

```powershell
$Repo = 'C:\Users\T14s\Downloads\mantto_gestor_frontend'
$Zip = Join-Path $env:USERPROFILE 'Downloads\FIX_BLT_NOW_FASE_5_DASHBOARD_LOGISTICA_V001.zip'
$Work = Join-Path $env:TEMP ('BLTNOW_DASH_F5_' + [guid]::NewGuid().ToString('N'))
$Backup = Join-Path $env:TEMP ('BLTNOW_DASH_F5_BACKUP_' + [guid]::NewGuid().ToString('N'))

if (!(Test-Path -LiteralPath $Zip)) { throw "No existe ZIP: $Zip" }
if (!(Test-Path -LiteralPath (Join-Path $Repo '.git'))) { throw 'No se encuentra repositorio Git local.' }
Expand-Archive -LiteralPath $Zip -DestinationPath $Work
Set-Location $Repo

# Hash Git esperado de los archivos COMPLETOS que dejo la Fase 3.
$Base=@(
  @{Rel='modules\dashboard-logistica\dashboard-logistica.js'; Hash='fab3df3e11f22f11baa04894644c2f00adfa5622'},
  @{Rel='tests\logistica_dashboard_fase1_movimientos_acordeon.test.js'; Hash='34e6d376b055619652d8fea4303b55ff2db2ec54'},
  @{Rel='tests\logistica_dashboard_fase3_rutas_contenedores_periodo.test.js'; Hash='4c47028455494612e7d7749bffc3eb67cd4643ea'}
)
$LoaderRel='core\module-loader.js'
$CssRel='modules\dashboard-logistica\dashboard-logistica-simulador.css'
$TestF5='tests\logistica_dashboard_fase5_simulador_frontend.test.js'
$RequiredTests=@(
  'tests\logistica_dashboard_fase2_promedios_ruta_periodo.test.js',
  'tests\logistica_dashboard_fase4_motor_simulacion_fletes.test.js'
)
foreach ($entry in $Base) {
  $Target=Join-Path $Repo $entry.Rel
  $Source=Join-Path $Work $entry.Rel
  if (!(Test-Path -LiteralPath $Target) -or !(Test-Path -LiteralPath $Source)) { throw "Falta archivo: $($entry.Rel)" }
  if ((git hash-object -- $Target).Trim() -ne $entry.Hash) {
    throw "Archivo local distinto a la Fase 3: $($entry.Rel). Integrar antes de aplicar."
  }
}
foreach ($rel in $RequiredTests) {
  if (!(Test-Path -LiteralPath (Join-Path $Repo $rel))) { throw "Falta prueba de fase previa: $rel" }
}
foreach ($rel in @($CssRel,$TestF5)) {
  if (Test-Path -LiteralPath (Join-Path $Repo $rel)) { throw "Ya existe $rel. Revisar antes de sobrescribir." }
  if (!(Test-Path -LiteralPath (Join-Path $Work $rel))) { throw "ZIP incompleto: $rel" }
}

# Contrato del Backend F4 obligatorio: no se copia ni se altera desde este ZIP.
$F4Service=Join-Path $Repo 'backend\src\modules\logistica-dashboard\logistica-dashboard.service.js'
$F4Repo=Join-Path $Repo 'backend\src\modules\logistica-dashboard\logistica-dashboard.repository.js'
$F4Routes=Join-Path $Repo 'backend\src\modules\logistica-dashboard\logistica-dashboard.routes.js'
if (!(Test-Path $F4Service) -or !(Test-Path $F4Repo) -or !(Test-Path $F4Routes)) { throw 'Falta backend F4.' }
if (!([IO.File]::ReadAllText($F4Service).Contains('freightSimulation_cor')) -or
    !([IO.File]::ReadAllText($F4Repo).Contains('freightSimulationSamples_cor')) -or
    !([IO.File]::ReadAllText($F4Routes).Contains("'/simulacion'"))) {
  throw 'No se identifica el motor completo del Backend Fase 4.'
}

# Cirugia LOCAL de una sola entrada del loader: conservar todo lo demas.
$LoaderPath=Join-Path $Repo $LoaderRel
$OldEntry="'logistica-dashboard':{css:['./modules/dashboard-logistica/dashboard-logistica.css?v=20260923-dashboard-ppns-final-v001'],js:['./modules/dashboard-logistica/dashboard-logistica.js?v=20261021-dashboard-fase3-v001']},"
$NewEntry="'logistica-dashboard':{css:['./modules/dashboard-logistica/dashboard-logistica.css?v=20260923-dashboard-ppns-final-v001','./modules/dashboard-logistica/dashboard-logistica-simulador.css?v=20261021-dashboard-fase5-v001'],js:['./modules/dashboard-logistica/dashboard-logistica.js?v=20261021-dashboard-fase5-v001']},"
$LoaderText=[IO.File]::ReadAllText($LoaderPath)
if ([regex]::Matches($LoaderText,[regex]::Escape($OldEntry)).Count -ne 1) {
  throw 'Loader local distinto de Fase 3: integrar solo la entrada de Logistica Dashboard, no sobrescribir el loader completo.'
}

# Preparar respaldos ANTES de cambiar algo.
$ToBackup=@($Base | ForEach-Object {$_.Rel})+@($LoaderRel)
foreach ($rel in $ToBackup) {
  $Target=Join-Path $Repo $rel
  $Saved=Join-Path $Backup $rel
  New-Item -ItemType Directory -Path (Split-Path $Saved) -Force | Out-Null
  Copy-Item -LiteralPath $Target -Destination $Saved
}

$Applied=$false
try {
  $Applied=$true
  foreach ($entry in $Base) {
    Copy-Item -LiteralPath (Join-Path $Work $entry.Rel) -Destination (Join-Path $Repo $entry.Rel) -Force
  }
  Copy-Item -LiteralPath (Join-Path $Work $CssRel) -Destination (Join-Path $Repo $CssRel)
  Copy-Item -LiteralPath (Join-Path $Work $TestF5) -Destination (Join-Path $Repo $TestF5)
  $Utf8NoBom = New-Object System.Text.UTF8Encoding($false)
  [IO.File]::WriteAllText($LoaderPath,$LoaderText.Replace($OldEntry,$NewEntry),$Utf8NoBom)

  foreach ($rel in @('modules\dashboard-logistica\dashboard-logistica.js',$LoaderRel,$TestF5)) {
    node --check (Join-Path $Repo $rel)
    if ($LASTEXITCODE -ne 0) { throw "Error sintactico: $rel" }
  }
  $Tests=@(
    'tests\logistica_dashboard_fase1_movimientos_acordeon.test.js',
    'tests\logistica_dashboard_fase2_promedios_ruta_periodo.test.js',
    'tests\logistica_dashboard_fase3_rutas_contenedores_periodo.test.js',
    'tests\logistica_dashboard_fase4_motor_simulacion_fletes.test.js',
    $TestF5
  ) | ForEach-Object { Join-Path $Repo $_ }
  node --test @Tests
  if ($LASTEXITCODE -ne 0) { throw 'Pruebas locales fallidas. Se restaurara el respaldo.' }
  git diff --check
  if ($LASTEXITCODE -ne 0) { throw 'git diff --check fallo.' }
  git status --short
  Write-Host "Fase 5 integrada SOLO en local. Respaldo: $Backup"
} catch {
  if ($Applied) {
    foreach ($rel in $ToBackup) {
      Copy-Item -LiteralPath (Join-Path $Backup $rel) -Destination (Join-Path $Repo $rel) -Force
    }
    Remove-Item -LiteralPath (Join-Path $Repo $CssRel) -Force -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath (Join-Path $Repo $TestF5) -Force -ErrorAction SilentlyContinue
  }
  throw
}
```

## Validaciones reales del ZIP

- Integración temporal **F1 + F2 + F3 + F4 + F5**, con archivos completos y tests previos: **67/67 pruebas correctas** mediante `node --test`; incluido contrato real del servicio F4 con repositorio simulado.
- `node --check` en JavaScript/frontend y scripts modificados: correcto.
- Contratos comprobados: `anio_promedios=2025|all`, fechas EXW/zarpe mutuamente exclusivas, muestra `0`, muestra `<10`, fechas mostradas en `DD/MM/AAAA`, casos de error y respuestas tardías, HTML de textos externos escapado, protección por Guard en los tests F4.
- Paquete ZIP comprobado con `unzip -t` y estructura de carpetas. Sin archivos `.patch`, instaladores, SQL ni código backend extra.

**No validado todavía:** conexión real a Aiven, navegador E2E real (responsive/PWA visual), Azure o Netlify en funcionamiento, latencias de datos históricos y ruta real. La validación visual y con datos reales debe realizarse en **Local → GitHub Pages** antes de autorizar despliegue manual de Netlify.

**Sistemas externos intactos:** no se aplicaron cambios a GitHub, Aiven, Azure ni Netlify; no se hizo commit, push, migración, despliegue ni operación de BD.
