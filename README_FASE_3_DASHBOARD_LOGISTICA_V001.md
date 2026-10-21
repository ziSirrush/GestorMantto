# BLT NOW / Gestor — FIX Fase 3: Dashboard Logística V001

**Fecha:** 21/10/2026  
**Alcance:** Logística → Dashboard, fase 3 de 5, **solo frontend**.  
**GitHub main consultado:** `ziSirrush/GestorMantto`, commit `48d87594d5139c4fa911ef4a4abd794a705299c4` (`Version 102126.1`).  
**Bases de integración:** archivos completos de los FIX entregados en Fase 1 y Fase 2 de este Dashboard. **Es requisito aplicarlos antes de Fase 3.** No se afirma que F1/F2 ya estén integrados en `main` ni desplegados.

## Objetivo, causa y cambios

1. **Tabla única «Promedios logísticos por ruta»**: reemplaza las tablas visuales independientes «Promedio de salida por puerto» y «Promedio de tránsito según modo» por filas identificadas por **puerto origen + puerto destino + modo ICT**. Consume `tablas.promedios_por_ruta` (backend F2). Muestra operaciones totales, medias EXW→Zarpe, Zarpe→Llegada y EXW→Llegada, y el `n` de cada media. **No suma promedios de muestras diferentes:** el total se lee ya calculado sobre operaciones completas por F2. Si no hay muestra, muestra `—`, no 0 días.
2. **«Período de análisis»**: año actual, año histórico o «Todos los años» afectan **simultáneamente** la tabla unificada y el ring/12 meses de contenedores. Los promedios usan año de `fecha_salida_real`; los contenedores usan año de `fecha_salida_estimada` (ETD). Con `all`, los meses consolidan cada mes de todos los años.
3. **Contenedores del período**: ring y tablas mensuales consumen `contenedores_periodo` de F2. Presentan el año seleccionado o la leyenda «Todos los años (ETD)», sin etiquetar erróneamente un histórico como «año actual». Se conserva el conteo físico 20' DC y 40' HQ.
4. **Refresco**: conserva el período seleccionado. Rechaza de forma explícita un backend sin contrato F2 o con períodos contradictorios, en vez de representar un 0 falso.
5. **Conservación de F1**: movimientos semanales con estatus anterior/nuevo, acordeón «Proyectos sin PP NS», gráficas, filtros de cortes y apertura de detalles no se alteran.
6. **Cache-bust** solo para el JS del Dashboard: `20261021-dashboard-fase3-v001`. CSS actual sin cambios. La tabla usa el scroll local existente para móvil.

**El Simulador de Fletes NO se implementa aquí:** motor en Fase 4 e interfaz en Fase 5.

## Contenido — archivos completos

- `modules/dashboard-logistica/dashboard-logistica.js` — actualizado desde Fase 1.
- `core/module-loader.js` — **archivo completo de referencia** con solo la nueva versión del JS del Dashboard frente a Fase 1. **No sobrescribir el loader local: aplicar sustitución puntual** para preservar otros fixes.
- `tests/logistica_dashboard_fase1_movimientos_acordeon.test.js` — se actualiza solo la aserción del número de versión; conserva seis pruebas F1.
- `tests/logistica_dashboard_fase3_rutas_contenedores_periodo.test.js` — 11 nuevas pruebas offline.
- `README_FASE_3_DASHBOARD_LOGISTICA_V001.md` — instrucciones y comprobaciones.

**Sin** archivos `.patch`, instaladores, SQL, middleware, rutas nuevas ni cambios de BD. **No contiene ni sobrescribe backend F2.**

## Aplicación LOCAL segura — PowerShell

> Utiliza un repositorio local Git, con Fase 1 del Dashboard y backend de Fase 2 ya aplicados. La verificación de hashes detiene la aplicación si hay cambios locales incompatibles; **no se sobrescriben silenciosamente**. Cambia `$Repo` si trabajas en otra carpeta.

```powershell
$Repo = 'C:\Users\T14s\Downloads\mantto_gestor_frontend'
$Zip  = Join-Path $env:USERPROFILE 'Downloads\FIX_BLT_NOW_FASE_3_DASHBOARD_LOGISTICA_V001.zip'
$Work = Join-Path $env:TEMP ('BLTNOW_DASH_F3_' + [guid]::NewGuid().ToString('N'))
$Backup = Join-Path $env:TEMP ('BLTNOW_DASH_F3_BACKUP_' + [guid]::NewGuid().ToString('N'))

if (!(Test-Path -LiteralPath $Zip)) { throw "No existe ZIP: $Zip" }
if (!(Test-Path -LiteralPath (Join-Path $Repo '.git'))) { throw 'No es una carpeta Git.' }
Expand-Archive -LiteralPath $Zip -DestinationPath $Work
Set-Location $Repo

$JsRel='modules\dashboard-logistica\dashboard-logistica.js'
$LoaderRel='core\module-loader.js'
$TestF1Rel='tests\logistica_dashboard_fase1_movimientos_acordeon.test.js'
$TestF2Rel='tests\logistica_dashboard_fase2_promedios_ruta_periodo.test.js'
$TestF3Rel='tests\logistica_dashboard_fase3_rutas_contenedores_periodo.test.js'
$RepoF2Rel='backend\src\modules\logistica-dashboard\logistica-dashboard.repository.js'
$SvcF2Rel='backend\src\modules\logistica-dashboard\logistica-dashboard.service.js'

$MustMatch=@(
  @{Rel=$JsRel;Hash='da4528dfd319bb29c097a8cb097c3715c41013eb'},
  @{Rel=$TestF1Rel;Hash='5d7be17cd81a8bee4c6acca7132c730d8697834e'},
  @{Rel=$RepoF2Rel;Hash='38b29a4d842a75316b353791fb20175c44670edb'},
  @{Rel=$SvcF2Rel;Hash='005efd98951811c6cae004a8310c94fa3bf0c533'}
)
foreach ($entry in $MustMatch) {
  $Dest=Join-Path $Repo $entry.Rel
  if (!(Test-Path -LiteralPath $Dest)) { throw "Falta fase previa o archivo: $($entry.Rel)" }
  $Hash=(git hash-object -- $Dest).Trim()
  if ($Hash -ne $entry.Hash) { throw "Archivo diferente al esperado: $($entry.Rel). Combinar manualmente, no sobrescribir." }
}
if (!(Test-Path -LiteralPath (Join-Path $Repo $TestF2Rel))) { throw 'Falta test de Fase 2. Aplica Fase 2 antes.' }
if (Test-Path -LiteralPath (Join-Path $Repo $TestF3Rel)) { throw 'Ya existe el test de Fase 3; revisar primero.' }

$LoaderPath=Join-Path $Repo $LoaderRel
$OldRef='./modules/dashboard-logistica/dashboard-logistica.js?v=20261021-dashboard-fase1-v001'
$NewRef='./modules/dashboard-logistica/dashboard-logistica.js?v=20261021-dashboard-fase3-v001'
$LoaderText=[System.IO.File]::ReadAllText($LoaderPath)
if ([regex]::Matches($LoaderText,[regex]::Escape($OldRef)).Count -ne 1) {
  throw 'El loader no tiene exactamente la referencia de Fase 1. Integrar manualmente.'
}

foreach ($rel in @($JsRel,$LoaderRel,$TestF1Rel)) {
  $Target=Join-Path $Repo $rel
  $Destination=Join-Path $Backup $rel
  New-Item -ItemType Directory -Path (Split-Path $Destination) -Force | Out-Null
  Copy-Item -LiteralPath $Target -Destination $Destination
}

Copy-Item -LiteralPath (Join-Path $Work $JsRel) -Destination (Join-Path $Repo $JsRel) -Force
Copy-Item -LiteralPath (Join-Path $Work $TestF1Rel) -Destination (Join-Path $Repo $TestF1Rel) -Force
Copy-Item -LiteralPath (Join-Path $Work $TestF3Rel) -Destination (Join-Path $Repo $TestF3Rel)
[System.IO.File]::WriteAllText($LoaderPath,$LoaderText.Replace($OldRef,$NewRef),(New-Object System.Text.UTF8Encoding($false)))

node --check (Join-Path $Repo $JsRel); if ($LASTEXITCODE -ne 0) { throw 'Error sintaxis JS Dashboard' }
node --check $LoaderPath; if ($LASTEXITCODE -ne 0) { throw 'Error sintaxis module-loader' }
node --test (Join-Path $Repo $TestF1Rel) (Join-Path $Repo $TestF2Rel) (Join-Path $Repo $TestF3Rel)
if ($LASTEXITCODE -ne 0) { throw 'Fallo prueba de Fase 1, 2 o 3; restaurar desde respaldo.' }
git diff --check -- 'modules/dashboard-logistica/dashboard-logistica.js' 'core/module-loader.js' 'tests/logistica_dashboard_fase1_movimientos_acordeon.test.js'
git status --short
git diff -- 'modules/dashboard-logistica/dashboard-logistica.js' 'core/module-loader.js'
Write-Host "Respaldo local: $Backup"
```

Si un test falla tras copiar, restaurar JS, loader y test F1 desde `$Backup` y retirar el test F3 recién creado. El comando no ejecuta commit, push ni deploy.

## Validaciones ejecutadas antes de entregar

- Revisión de contrato exacto de backend F2: `tablas.promedios_por_ruta`, `contenedores_periodo`, `promedios.periodo` y `anio_promedios`.
- `node --check` en frontend, module loader, repository/service F2 y archivos de prueba: sintaxis correcta.
- `node --test` en árbol de pruebas local temporal con archivos F1+F2+F3: **30/30** pruebas correctas (**6 F1, 13 F2, 11 F3**). Backend simulado; no conexión a Aiven.
- Verificaciones de nulos vs cero real, muestras independientes, `all`, año histórico, periodos contradictorios, textos escapados, caché y conservación de F1.

**No ejecutado:** navegador E2E, consultas reales a Aiven, aplicación del FIX en el repositorio del usuario, commit, push ni despliegue.

## Prueba manual sugerida

Con F2 activo en backend local autorizado: entrar a Dashboard, comprobar tabla única y ring del año actual; buscar un año histórico con ETD; consultar «Todos los años» (ver leyenda correcta y meses consolidados); pulsar «Actualizar» (el período persiste). Comprobar Movimientos semanales, acordeón de PP NS y visualización móvil/scroll horizontal. Si aparece «se requiere Backend Fase 2», verificar integración y versión de Azure/local antes de continuar.

**Estado de sistemas externos:** GitHub, Aiven, Azure, Netlify y bases de datos **intactos**. Solo se generó un ZIP de aplicación local.
