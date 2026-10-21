# BLT NOW / Gestor — FIX FASE 2: Dashboard Logística V001

**Fecha:** 21/10/2026  
**Base GitHub main verificada:** `ziSirrush/GestorMantto` commit `48d87594d5139c4fa911ef4a4abd794a705299c4` (`Version 102126.1`).  
**Módulo:** Logística → Dashboard. **Fase:** 2 de 5, SOLO backend.

## Objetivo / causa

Las tablas de promedio de salida por puerto (EXW → zarpe) y promedio de tránsito por modo (zarpe → llegada) agrupan datos de forma distinta. No deben concatenarse ni sumarse sus promedios como si describieran la misma muestra. Además, el ring de contenedores del frontend estaba fijado al año actual aunque el usuario cambiara «Período de análisis».

## Cambios

1. **Nueva lectura de rutas** agrupada por `puerto_origen + puerto_destino + ict`, sobre `log_ops`:
   - `operaciones`: cantidad de registros de la ruta con al menos un tramo válido.
   - `operaciones_salida` / `promedio_dias_salida`: `fecha_exw → fecha_salida_real`.
   - `operaciones_transito` / `promedio_dias_llegada`: `fecha_salida_real → fecha_llegada_real`.
   - `operaciones_completas` / `promedio_dias_total`: **solo registros con AMBOS tramos válidos**. El total es el promedio directo de `fecha_llegada_real − fecha_exw`, NO la suma de promedios con muestras distintas.
   - Se descartan fechas invertidas, ausentes, no interpretables y rutas sin identificación completa; los promedios sin muestra devuelven `null`, no un falso cero.
2. **Período de contenedores por ETD (`fecha_salida_estimada`)**: año actual por defecto, año seleccionado o `all` (todo el histórico). Incluye ring físico 20' DC/40' HQ y desglose enero–diciembre. Con `all`, cada mes consolida ese mismo mes de todos los años.
3. El catálogo de años para seleccionar período **combina años con salidas reales y años con ETD** (permitiendo consultar años con solo contenedores).
4. **Compatibilidad entre fases:** el endpoint existente `GET /api/logistica/dashboard?anio_promedios=2025|all` conserva `tablas.salida_por_puerto`, `tablas.llegada_por_modo_puerto` y `contenedores` (año actual) para la interfaz vigente. Añade:
   - `tablas.promedios_por_ruta`.
   - `contenedores_periodo` con `periodo`, `etiqueta`, `anio`, totales, porcentajes y `meses[12]`.
   - `promedios.anios_con_salida_real` y catálogo ampliado `promedios.anios_disponibles`.

**La Fase 3 conectará el frontend a los nuevos campos**, unificará visualmente las tablas y hará que el ring cambie con el selector. Esta Fase 2 no cambia pantallas; el ring anterior sigue fijo hasta Fase 3.

## Entrega — archivos completos

- `backend/src/modules/logistica-dashboard/logistica-dashboard.repository.js`
- `backend/src/modules/logistica-dashboard/logistica-dashboard.service.js`
- `tests/logistica_dashboard_fase2_promedios_ruta_periodo.test.js` (nuevo)
- `README_FASE_2_DASHBOARD_LOGISTICA_V001.md`

No se modificaron controller, rutas, middleware, permisos, frontend ni esquema de BD. Sin `.patch` ni instaladores. Usa las columnas existentes de `log_ops` (referencia: `Sabana Estrutura 071026.sql`). No se añaden tablas, columnas ni endpoints, ni se escribe en BD.

**Protección vigente:** el endpoint analítico sigue sujeto a autenticación y al Guard General con alcance completo CORELLIAN ya establecido; este FIX no altera esa ruta ni relaja la autorización.

## Aplicación LOCAL — PowerShell

> No publica, no hace commit, no push. **No sobrescribas archivos cuyo hash difiera de la base sin integrar primero tus cambios locales.**

```powershell
$Repo = 'C:\Users\T14s\Downloads\mantto_gestor_frontend'
$Zip  = Join-Path $env:USERPROFILE 'Downloads\FIX_BLT_NOW_FASE_2_DASHBOARD_LOGISTICA_V001.zip'
$Work = Join-Path $env:TEMP ('BLTNOW_DASH_F2_' + [guid]::NewGuid().ToString('N'))
Set-Location $Repo
if (!(Test-Path '.git')) { throw 'La ruta no contiene un repositorio Git.' }
Expand-Archive -LiteralPath $Zip -DestinationPath $Work

$Files = @(
  @{ Rel='backend\src\modules\logistica-dashboard\logistica-dashboard.repository.js'; Hash='a8db0a25c4a1839ab4a93cdd809d32362437828c' },
  @{ Rel='backend\src\modules\logistica-dashboard\logistica-dashboard.service.js'; Hash='985b5f4df448ca8eb6e527883f4bf35c4ebb1267' }
)
foreach ($f in $Files) {
  $Dest = Join-Path $Repo $f.Rel
  if (!(Test-Path -LiteralPath $Dest)) { throw "Falta: $Dest" }
  if ((git hash-object -- $Dest).Trim() -ne $f.Hash) {
    throw "Archivo local diferente a la base: $($f.Rel). Combinar manualmente; no sobrescribir."
  }
}
$TestRel = 'tests\logistica_dashboard_fase2_promedios_ruta_periodo.test.js'
$TestDest = Join-Path $Repo $TestRel
if (Test-Path -LiteralPath $TestDest) { throw 'El test ya existe: revisar antes de sobrescribir.' }
$Backup = Join-Path $env:TEMP ('BLTNOW_DASH_F2_BACKUP_' + [guid]::NewGuid().ToString('N'))
foreach ($f in $Files) {
  $Dest = Join-Path $Repo $f.Rel
  $Bak = Join-Path $Backup $f.Rel
  New-Item -ItemType Directory -Path (Split-Path $Bak) -Force | Out-Null
  Copy-Item -LiteralPath $Dest -Destination $Bak
  Copy-Item -LiteralPath (Join-Path $Work $f.Rel) -Destination $Dest -Force
}
Copy-Item -LiteralPath (Join-Path $Work $TestRel) -Destination $TestDest

node --check (Join-Path $Repo $Files[0].Rel)
node --check (Join-Path $Repo $Files[1].Rel)
node --check $TestDest
node --test $TestDest
git diff --check
git status --short
git diff -- 'backend/src/modules/logistica-dashboard/logistica-dashboard.repository.js' 'backend/src/modules/logistica-dashboard/logistica-dashboard.service.js'
Write-Host "Respaldo local: $Backup"
```

**Si hubo cambios locales en los dos archivos base**, detener la aplicación y revisar el diff; el hash de seguridad impide sobrescrituras silenciosas.

## Validaciones efectivamente ejecutadas

- `node --check` sobre ambos archivos JavaScript del backend y el test: **correcto**.
- `node --test tests/logistica_dashboard_fase2_promedios_ruta_periodo.test.js`: **13/13 pruebas correctas**, con BD/repositorio simulados.
- Comprobación de agrupación y cálculos SQL por inspección de las consultas generadas, parametrización, períodos `2025`, `2026`, `all`, normalización de muestras, campos legacy y validación 400 de años inválidos.
- SHA base de los dos archivos confirmado con GitHub y `git hash-object` antes de construir el FIX.
- ZIP auditado por nombres/rutas, sin SQL ejecutable, `.patch`, paquetes adicionales o instalación.

**No ejecutado:** consultas SQL contra MySQL real, pruebas E2E del navegador, despliegue, cambios en Azure/Aiven/Netlify/GitHub. Se requiere prueba manual del endpoint en entorno autorizado antes de aprobar la Fase 3.

## Verificación manual recomendada después de aplicar localmente

Consultar con un backend local autorizado:

- `GET /api/logistica/dashboard` → `tablas.promedios_por_ruta`, `contenedores_periodo.periodo` del año actual.
- `GET /api/logistica/dashboard?anio_promedios=2025` → promedios por `fecha_salida_real = 2025` y contenedores por ETD 2025.
- `GET /api/logistica/dashboard?anio_promedios=all` → promedios históricos, contenedores históricos y meses consolidados.
- Comprobar con registros reales que el promedio total usa solamente operaciones completas y que no se filtran registros de otra identidad fuera del Guard existente.

**Sistemas externos sin modificación:** GitHub, Aiven, Azure, Netlify. **Sin commit, push ni publicación.**
