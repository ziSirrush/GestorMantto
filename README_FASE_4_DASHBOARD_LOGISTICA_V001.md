# BLT NOW / Gestor — FIX Fase 4: Motor de Simulación de Fletes V001

**Fecha:** 21/10/2026  
**Módulo:** Logística → Dashboard · **Fase 4 de 5** · **solo backend**.  
**Código oficial consultado:** `ziSirrush/GestorMantto` `main`, commit `48d87594d5139c4fa911ef4a4abd794a705299c4` (Version 102126.1).  
**Prerequisito:** Fase 2 del Dashboard aplicada en backend; Fases 1 y 3 son frontend y no se modifican aquí.

## Objetivo y causa

Preparar el **motor de simulación desde EXW o zarpe hasta entrega real en obra** con la única fuente operativa `log_ops` de Aiven. El endpoint analítico de Fases 1-3 no devuelve fechas individuales ni calcula el tramo puerto→obra, por lo que el motor necesita leer registros históricos de la misma ruta para generar estimaciones y percentiles **sin sumar promedios de muestras incompatibles**.

## Cambios

1. `repository.js`: nueva consulta de **solo lectura** por `puerto_origen`, `puerto_destino`, `ict`, año de `fecha_salida_real` y, opcionalmente, `lugar_entrega`. Todos los valores mediante placeholders SQL; límite de lectura de 2001 registros, con rechazo explícito si hay más de 2000.
2. `service.js`: motor con validación del período **idéntica a Fase 2** (`resolveAverageFilter_cor`) y mismas reglas de agrupación por ruta. Acepta fecha inicial `fecha_exw` **o** `fecha_zarpe` (exactamente una), formato canónico `YYYY-MM-DD`, y período `anio_promedios` (año actual CDMX, año histórico o `all`).
3. Cálculo de días observados de operaciones cronológicamente válidas:
   - Desde **EXW**: requiere cuatro fechas reales completas, `fecha_exw ≤ fecha_salida_real ≤ fecha_llegada_real ≤ fecha_entrega_real_obra`.
   - Desde **ZARPE**: requiere las últimas tres fechas reales, en ese mismo orden.
   - Todo un escenario usa **la misma cohorte de operaciones completas**; no concatena los promedios de otras tablas con tamaños de muestra diferentes.
   - **Promedio:** media aritmética de días acumulados. **Optimista/conservador:** percentiles empíricos P25/P75, calculados solo si existen al menos **10 operaciones completas**; si hay 1-9, únicamente media; si hay 0, `sin_datos` con fechas `null`.
   - Los percentiles se calculan sobre días acumulados desde la fecha inicial; cada etapa queda ordenada en el tiempo. No se agregan márgenes arbitrarios ni pronósticos falsos.
4. `controller.js` / `routes.js`: nuevo `GET /api/logistica/dashboard/simulacion`, **solo lectura**, protegido por el **mismo Guard General, permiso `LOGISTICA_DASHBOARD_PIPELINE_POR_ESTATUS_ETAPAS.VER`, agrupación LOGISTICA y alcance completo CORELLIAN** que el Dashboard. Se conserva íntegro `GET /api/logistica/dashboard`.
5. No se cambia frontend, loader, CSS, sincronización, esquema SQL ni datos. **La interfaz visual del simulador corresponde a Fase 5.**

## Límites y precisión de los datos

- La duración **puerto destino → obra** se define como `fecha_entrega_real_obra − fecha_llegada_real`. **Incluye esperas** (aduana, almacenamiento o programación) entre ambas fechas; no equivale necesariamente a tiempo de carretera.
- Sin `lugar_entrega`, la estimación del último tramo **agrega diferentes destinos de obra** dentro de la ruta. Si se suministra `lugar_entrega`, filtra ese valor exacto; **no recurre silenciosamente al conjunto global** si no tiene muestra.
- La tabla de promedios Fase 2 puede mostrar otra media debido a que utiliza su muestra válida por etapa; el simulador usa exclusivamente operaciones **completas hasta obra** para preservar consistencia estadística.
- Se desechan fechas inexistentes, incompletas o con orden invertido. Cada resultado declara tamaño de muestra y advertencias. Son **estimaciones históricas**, no fechas de transporte garantizadas ni información en tiempo real.
- El año del simulador se determina por **zarpe real** (`fecha_salida_real`), igual que el filtro de promedios; los contenedores mantienen su propio criterio ETD.
- Un calendario UTC se utiliza para operaciones de fechas puras y se evita el desfase por zona horaria. El frontend presentará `DD/MM/AAAA` en Fase 5.

## Contrato para Fase 5

```text
GET /api/logistica/dashboard/simulacion?
  puerto_origen=Shanghai&puerto_destino=Manzanillo&ict=Maritimo&
  fecha_zarpe=2026-11-01&anio_promedios=2025
```

Parámetros: `puerto_origen` (obligatorio), `puerto_destino` (obligatorio), `ict` (obligatorio), `fecha_zarpe` **o** `fecha_exw` (exactamente uno), `anio_promedios` opcional (por defecto año actual; acepta `all`), `lugar_entrega` opcional. Usar `encodeURIComponent()` para los valores con acentos o espacios.

**Respuesta:** envoltura `{ok:true,source:'aiven',generated_at,data}` con `data.periodo`, `data.inicio`, `data.ruta`, `data.muestra`, `data.escenarios` (optimista/promedio/conservador; nulos si insuficiente), `data.metodologia` y `data.advertencias`. Cada escenario contiene fechas `exw`, `zarpe`, `llegada_puerto`, `llegada_obra`, y días por etapa. Sin muestra devuelve `estado:'sin_datos'` (HTTP 200). Parámetros inválidos dan error 400; exceso de 2000 registros, 422. **No devuelve registros individuales.**

## Archivos incluidos (completos)

```text
backend/src/modules/logistica-dashboard/logistica-dashboard.repository.js
backend/src/modules/logistica-dashboard/logistica-dashboard.service.js
backend/src/modules/logistica-dashboard/logistica-dashboard.controller.js
backend/src/modules/logistica-dashboard/logistica-dashboard.routes.js
tests/logistica_dashboard_fase4_motor_simulacion_fletes.test.js
README_FASE_4_DASHBOARD_LOGISTICA_V001.md
```

**No incluye** `.patch`, instaladores, SQL, frontend ni archivos ajenos al cambio.

## Aplicación LOCAL segura — PowerShell

> Esta secuencia **no hace commit, push ni despliegue**. Verifica los hashes Git de los archivos locales antes de reemplazar y respalda los cuatro archivos. Si hay modificaciones locales incompatibles, **se detiene sin sobrescribir**. Cambia `$Repo` si corresponde.

```powershell
$Repo = 'C:\Users\T14s\Downloads\mantto_gestor_frontend'
$Zip  = Join-Path $env:USERPROFILE 'Downloads\FIX_BLT_NOW_FASE_4_DASHBOARD_LOGISTICA_V001.zip'
$Work = Join-Path $env:TEMP ('BLTNOW_DASH_F4_' + [guid]::NewGuid().ToString('N'))
$Backup = Join-Path $env:TEMP ('BLTNOW_DASH_F4_BACKUP_' + [guid]::NewGuid().ToString('N'))

if (!(Test-Path -LiteralPath $Zip)) { throw "No existe ZIP: $Zip" }
if (!(Test-Path -LiteralPath (Join-Path $Repo '.git'))) { throw 'Repo local no válido.' }
Expand-Archive -LiteralPath $Zip -DestinationPath $Work
Set-Location $Repo

$Files = @(
  @{Rel='backend\src\modules\logistica-dashboard\logistica-dashboard.repository.js'; Base='38b29a4d842a75316b353791fb20175c44670edb'},
  @{Rel='backend\src\modules\logistica-dashboard\logistica-dashboard.service.js'; Base='005efd98951811c6cae004a8310c94fa3bf0c533'},
  @{Rel='backend\src\modules\logistica-dashboard\logistica-dashboard.controller.js'; Base='29ea4a9c4b50b45a49ce9980112a28e028c7385f'},
  @{Rel='backend\src\modules\logistica-dashboard\logistica-dashboard.routes.js'; Base='a87819fe85d38e111e6395b4c87ff373c3ae8c23'}
)
$TestRel='tests\logistica_dashboard_fase4_motor_simulacion_fletes.test.js'
foreach ($f in $Files) {
  $Local = Join-Path $Repo $f.Rel
  $Source = Join-Path $Work $f.Rel
  if (!(Test-Path -LiteralPath $Local) -or !(Test-Path -LiteralPath $Source)) {
    throw "Falta archivo base o archivo ZIP: $($f.Rel)"
  }
  if ((git hash-object -- $Local).Trim() -ne $f.Base) {
    throw "Archivo local modificado o Fase 2 pendiente: $($f.Rel). Integrar manualmente."
  }
}
if (Test-Path -LiteralPath (Join-Path $Repo $TestRel)) { throw 'El test F4 ya existe: revisar antes de sobrescribir.' }
if (!(Test-Path -LiteralPath (Join-Path $Work $TestRel))) { throw 'Falta el test F4 en el ZIP.' }

$Applied=$false
try {
  foreach ($f in $Files) {
    $Local = Join-Path $Repo $f.Rel
    $Saved = Join-Path $Backup $f.Rel
    New-Item -ItemType Directory -Path (Split-Path $Saved) -Force | Out-Null
    Copy-Item -LiteralPath $Local -Destination $Saved -Force
  }
  $Applied=$true
  foreach ($f in $Files) {
    Copy-Item -LiteralPath (Join-Path $Work $f.Rel) -Destination (Join-Path $Repo $f.Rel) -Force
  }
  Copy-Item -LiteralPath (Join-Path $Work $TestRel) -Destination (Join-Path $Repo $TestRel)

  foreach ($f in $Files) {
    node --check (Join-Path $Repo $f.Rel)
    if ($LASTEXITCODE -ne 0) { throw "Error de sintaxis: $($f.Rel)" }
  }
  $Checks = @(
    'tests\logistica_dashboard_fase1_movimientos_acordeon.test.js',
    'tests\logistica_dashboard_fase2_promedios_ruta_periodo.test.js',
    'tests\logistica_dashboard_fase3_rutas_contenedores_periodo.test.js',
    $TestRel
  ) | Where-Object { Test-Path -LiteralPath (Join-Path $Repo $_) }
  $TestPaths = @($Checks | ForEach-Object { Join-Path $Repo $_ })
  node --test @TestPaths
  if ($LASTEXITCODE -ne 0) { throw 'Las pruebas fallaron. Se restaurarán los archivos previos.' }
  git diff --check
  if ($LASTEXITCODE -ne 0) { throw 'git diff --check detectó un problema.' }
  git status --short
  git diff -- 'backend/src/modules/logistica-dashboard'
  Write-Host "Fase 4 local aplicada y comprobada. Respaldo: $Backup"
} catch {
  if ($Applied) {
    foreach ($f in $Files) {
      $Saved=Join-Path $Backup $f.Rel
      if (Test-Path -LiteralPath $Saved) {
        Copy-Item -LiteralPath $Saved -Destination (Join-Path $Repo $f.Rel) -Force
      }
    }
    Remove-Item -LiteralPath (Join-Path $Repo $TestRel) -Force -ErrorAction SilentlyContinue
  }
  throw
}
```

## Validación REAL ejecutada al preparar el ZIP

- Verificado `main` de GitHub y cotejada Fase 2 entregada con sus hashes SHA de blobs; controller y rutas recuperados byte a byte del `main` vigente comprobado.
- `node --check` sobre los cuatro archivos backend, archivo de prueba y frontend Fase 3 en integración temporal: correcto.
- `node --test` de **Fases 1 + 2 + 3 + 4** en integración temporal: **51/51 pruebas correctas**, simulación con registros sintéticos y BD de prueba simulada (sin acceso a Aiven).
- Pruebas de año/`all`, entrada EXW vs zarpe, fechas imposibles y bisiestas, percentiles empíricos, nulos, ausencia de datos, límites de lectura, parametrización SQL, mismo Guard CORELLIAN y contratos existentes.
- ZIP revisado con `unzip -t`; contiene los **archivos completos** especificados y no ejecutables remotos.

**NO ejecutado:** consulta real a Aiven, prueba E2E en Azure/navegador, aplicación al repositorio del usuario, commit, push, despliegue, escritura de BD. Validar con datos reales autorizados antes de comenzar la Fase 5 visual.

**Sistemas externos sin modificar:** GitHub, Aiven, Azure, Netlify y bases de datos.
