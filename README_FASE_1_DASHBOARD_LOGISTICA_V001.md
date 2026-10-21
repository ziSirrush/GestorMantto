# BLT NOW / Gestor — FIX FASE 1: Dashboard de Logística V001

**Fecha:** 21/10/2026  
**Base verificada:** `ziSirrush/GestorMantto`, `main`, commit `97a0a30a0d269629754afad07dfc054ea9ac831a` (`Version 102026.14`).  
**Alcance:** exclusivamente `Logística → Dashboard`, fase 1 de 5.

## Cambios realizados

1. **Movimientos semanales:** la tabla muestra **Estatus anterior** y **Estatus nuevo** en columnas independientes. Para `NUEVO_INGRESO`, anterior es `—`. Se mantienen tipo, PP NS, proyecto, selección de corte y apertura de detalle.
2. **Proyectos sin PP NS:** acordeón **contraído por defecto**; encabezado y contador siempre visibles; botón y encabezado permiten desplegar/replegar. Se preservan el contenido y la consulta existentes.
3. **Actualización de caché:** se cambia solo el parámetro de versión JS del Dashboard en `core/module-loader.js`. El CSS, el resto de rutas y otros módulos no se modifican.

**Causa:** el job `backend/src/jobs/logisticaCierreSemanal.job.js` ya guarda `estatus_anterior` y `estatus_actual` para cambios de estatus; el frontend únicamente mostraba `estatus_actual` y ocultaba el anterior en un `title`. No hacen falta nuevas consultas ni cambios de base de datos.

## Archivos completos dentro del ZIP

- `modules/dashboard-logistica/dashboard-logistica.js` — actualizado.
- `core/module-loader.js` — actualizado solo en la referencia de caché del Dashboard.
- `tests/logistica_dashboard_fase1_movimientos_acordeon.test.js` — seis pruebas nuevas de interfaz lógica, estados, datos escapados y caché.
- Este README.

**Sin archivos `.patch`, instaladores, SQL ni modificaciones a backend.**

## Aplicación local segura (PowerShell)

> Cambia `$Repo` si tu carpeta de trabajo es otra. **No aplicar directamente en GitHub, Azure, Aiven ni Netlify.** El FIX está basado en el `main` indicado arriba. Se valida la versión de origen del JS para no sobrescribir cambios locales.

```powershell
$Repo = 'C:\Users\T14s\Downloads\mantto_gestor_frontend'
$Zip  = Join-Path $env:USERPROFILE 'Downloads\FIX_BLT_NOW_FASE_1_DASHBOARD_LOGISTICA_V001.zip'
$Work = Join-Path $env:TEMP 'BLTNOW_DASH_F1_V001'
Expand-Archive -LiteralPath $Zip -DestinationPath $Work -Force

Set-Location $Repo
$JsPath = Join-Path $Repo 'modules\dashboard-logistica\dashboard-logistica.js'
$LoaderPath = Join-Path $Repo 'core\module-loader.js'
$OriginalHash = '9fbe58d7b66369e5b9f79912696358359aafac44'
$OldRef = './modules/dashboard-logistica/dashboard-logistica.js?v=20260923-dashboard-ppns-final-v001'
$NewRef = './modules/dashboard-logistica/dashboard-logistica.js?v=20261021-dashboard-fase1-v001'

if (!(Test-Path $JsPath) -or !(Test-Path $LoaderPath)) { throw 'Faltan archivos del Dashboard en el repo local.' }
if ((git hash-object -- $JsPath).Trim() -ne $OriginalHash) {
  throw 'Dashboard JS local diferente al main base: revisar y combinar antes de sobrescribir.'
}
$LoaderText = [System.IO.File]::ReadAllText($LoaderPath)
if ([regex]::Matches($LoaderText, [regex]::Escape($OldRef)).Count -ne 1) {
  throw 'Referencia del Dashboard distinta o duplicada en module-loader.js: revisar manualmente.'
}

Copy-Item -LiteralPath (Join-Path $Work 'modules\dashboard-logistica\dashboard-logistica.js') -Destination $JsPath -Force
Copy-Item -LiteralPath (Join-Path $Work 'tests\logistica_dashboard_fase1_movimientos_acordeon.test.js') -Destination (Join-Path $Repo 'tests') -Force
[System.IO.File]::WriteAllText($LoaderPath, $LoaderText.Replace($OldRef, $NewRef), (New-Object System.Text.UTF8Encoding($false)))

node --check $JsPath
node --check $LoaderPath
node --test (Join-Path $Repo 'tests\logistica_dashboard_fase1_movimientos_acordeon.test.js')
git diff --check
git status --short
git diff -- 'modules/dashboard-logistica/dashboard-logistica.js' 'core/module-loader.js'
```

**Importante:** aunque el ZIP incluye el `core/module-loader.js` completo, los comandos anteriores cambian **únicamente la referencia del Dashboard** en tu loader local. Esto evita revertir las versiones de PVO-Producción si ya integraste otros FIX pendientes. **No reemplaces el loader completo a ciegas si tienes cambios locales.**

## Validaciones efectivamente ejecutadas

- `node --check` sobre ambos archivos JS: **correcto**.
- `node --test tests/logistica_dashboard_fase1_movimientos_acordeon.test.js`: **6 de 6 pruebas correctas** en entorno aislado sin red.
- Origen de archivos confirmado mediante SHA de blobs Git: JS `9fbe58d7b66369e5b9f79912696358359aafac44`, loader `8a8ab6b1f2660a8c10637849553a8bece740dc0c`.
- **No ejecutado:** validación E2E en navegador, consultas reales a Aiven, despliegue, commit o publicación.

## Validación manual recomendada

Abrir **Logística → Dashboard**; revisar el último corte y uno histórico; confirmar `Anterior / Nuevo`, `—` en ingreso nuevo y apertura de detalle. Verificar que **Proyectos sin PP NS** inicia plegado, muestra el contador, abre, cierra y conserva la navegación de proyecto. Revisar escritorio y móvil.

**Estado de sistemas externos:** GitHub, Aiven, Azure, Netlify y cualquier entorno de producción **sin cambios**.
