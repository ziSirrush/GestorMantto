# BLT NOW - Instalaciones / Administracion - ALTAS FASE 4 V001

Fecha: 2026-10-20. **Entrega preparada para aplicar LOCALMENTE, SIN desplegar**.
Base GitHub comprobada: `ziSirrush/GestorMantto`, `main` commit `62eb487c56cdbeab40f8a7c859d081782287702c` (sin commits nuevos desde Fase 3).
Origen formulas: `FieldLine Instalaciones.xlsx`, Hoja1 fila 3, siete formulas AG/AR/AS/BB/BJ/BU/CC, ya implementadas como motor puro en Fase 3.

## 1. Que integra esta fase

- Habilita el boton **Guardar** en la captura de tabla/edicion fantasma de Fases 2-3. Solicita confirmacion y envia **exactamente un POST** con de 1 a 20 equipos.
- El POST existente de Fase 1 (`/api/instalaciones/administracion/altas`) valida permiso EDITAR, Guard CORELLIAN, alcance, referencias duplicadas, usuarios activos, y registra cada fila en `usuario_interacciones`. Todos los INSERT y la auditoria quedan en **una sola transaccion**.
- El backend usa formulas reales de F3 para los **equipos creados manualmente**: `meses_garantia_restantes`, `dias_restantes` (DIAS.LAB, solo `04-M`), `anio_termino`, `dias_sin_visita` (DIAS360), `costo_mensual_mantenimiento_cem`, `estatus_completo`, `dias_sin_ccnr`. Se preservan nulos. El job diario las mantiene para altas humanas; el historial GAS sigue con sus reglas previas. Cambios individuales posteriores de estos equipos recalculan sus derivados con la misma regla.
- Fechas **AR/BB** del Excel (columnas `fecha_fin_montaje_real` y `fecha_fin_ajuste_real`) **NO se persisten automaticamente**: sus formulas seleccionan fechas previstas, no terminaciones reales verificadas. La previsualizacion permanece en F3.
- Tras aceptar POST, realiza GET autorizado por cada `id_ins_fl` y refresca el modulo. Si POST se acepta pero falla GET, no repite escrituras. Si hay timeout/5xx o resultado incierto, bloquea reintento ciego y pide verificar en Aiven.
- Convivencia GAS: protege altas humanas del antiguo `/api/ins-fl/sync` usando la misma auditoria existente como marca de procedencia; si GAS intenta actualizar una de ellas, **rechaza TODO EL BLOQUE con 409, sin ejecutar ninguna fila** y pide conciliacion de la integracion. No se alteran las filas sin conflicto hasta que se reenvie el bloque depurado. Coordina POST/sync con `GET_LOCK` en Aiven. Si falla el preflight, devuelve 503 sin escribir.
- No agrega tablas, columnas, indices, triggers ni permisos. No modifica registros existentes por instalacion del codigo; el job diario se ejecuta cuando se despliegue backend, como ya ocurria antes.

**Riesgo operativo relevante:** ante cualquier fila humana de un lote GAS, se rechaza TODO el bloque. Esto prioriza integridad y exige coordinar filtrado/reenvio con el responsable de GAS antes de activar en produccion. La politica final de convivencia GAS y la carga E2E corresponden a Fase 5. El origen se determina por el evento de auditoria `CREAR/POST` asociado al ID y al PP NS; un PP NS alterado por rutas legadas requiere conciliacion adicional.

## 2. Archivos incluidos (solo modificados y nuevos)

**NUEVOS**:

- `backend/src/modules/instalaciones-administracion/instalaciones-administracion-altas-persist.js` - calculos de F3 persistibles; nunca AR/BB como reales.
- `backend/src/modules/instalaciones-administracion/instalaciones-administracion-altas-origin.js` - lectura indexada de auditoria y candado de concurrencia.
- `backend/src/modules/instalaciones-administracion/instalaciones-administracion-altas-sync-guard.js` - preflight GAS fail-closed.
- `backend/tests/instalaciones-administracion-altas-fase4.test.js` - 17 pruebas F4 aisladas.

**MODIFICADOS COMPLETOS**:

- `backend/src/modules/instalaciones-administracion/instalaciones-administracion-altas.service.js` (origen F1).
- `backend/src/modules/instalaciones-administracion/instalaciones-administracion.auto-service.js` (origen `main`).
- `backend/src/jobs/instalacionesAdministracionCalculados.job.js` (origen `main`).
- `backend/src/routes/ins-fl.routes.js` (origen `main`).
- `modules/instalaciones-administracion/instalaciones-administracion-altas-captura_cor.js` (origen F3).
- `modules/instalaciones-administracion/instalaciones-administracion-altas-captura_cor.css` (origen F2).
- `backend/tests/instalaciones-administracion-altas-fase1.test.js` (actualiza mocks del alta).
- `tests/instalaciones-administracion-altas-fase2.test.js` (habilita POST explicito).
- `tests/instalaciones-administracion-altas-fase3-formulas.test.js` (verifica persistencia diferenciada).

`instalaciones-administracion.routes.js` **no se repite**: el POST protegido fue entregado en F1. Los motores de formulas F3 tampoco se repiten porque estan intactos.
Los archivos `core/module-loader.js` y `service-worker.js` no se sobreescriben: recibieron cambios de otros modulos en `main`. El cambio localizado y seguro de sus versiones se hace mediante comandos PowerShell, tras verificaciones.

## 3. Aplicacion LOCAL - PowerShell (NO publica, NO commit)

**Precondiciones:** Fases 1, 2 y 3 instaladas *exactamente* en el mismo checkout, con el loader/SW ajustados por sus README. Resguardar los datos y trabajo local. El siguiente bloque valida hashes ANTES de modificar cualquier archivo. Ejecutarlo en PowerShell desde Windows; NO se debe ejecutar directamente sobre Azure/Aiven.

```powershell
$REPO = 'C:\Users\T14s\Downloads\mantto_gestor_frontend'
$ZIP = "$env:USERPROFILE\Downloads\BLTNOW_FASE4_ALTAS_INSTALACIONES_ADMIN_V001.zip"
Set-Location $REPO
if(-not (Test-Path -LiteralPath $ZIP)) { throw 'Falta ZIP de Fase 4.' }
git status --short

# Archivos compartidos del main: identidad Git blob exacta.
$gitExpected = @{
 'backend/src/modules/instalaciones-administracion/instalaciones-administracion.auto-service.js' = 'e30129fb42fd81e69918e351e82f0a91c71b540e'
 'backend/src/jobs/instalacionesAdministracionCalculados.job.js' = '5345781db022d123147963bc4103fa149247d442'
 'backend/src/routes/ins-fl.routes.js' = '3fc046a95127b25947639c7ed7af6ce1f43c64f2'
}
foreach($path in $gitExpected.Keys) {
 if(-not (Test-Path $path)) { throw "Falta archivo base: $path" }
 if((git hash-object -- $path).Trim() -ne $gitExpected[$path]) {
   throw "Archivo base distinto: $path. Conciliar; NO sobreescribir."
 }
}
# Archivos de F1-F3: se verifica SHA-256 del contenido entregado.
$shaExpected = @{
 'backend/src/modules/instalaciones-administracion/instalaciones-administracion-altas.service.js' = '2ca3a3856b12386f03b2a4d3e3d5c270c6d54d5d1e777f6abdb7819d30fd546a'
 'modules/instalaciones-administracion/instalaciones-administracion-altas-captura_cor.js' = '0b7b1da1513aa7668a52c3898594e6f5bc47fd4bed972e1af263eaa0467a3f9f'
 'modules/instalaciones-administracion/instalaciones-administracion-altas-captura_cor.css' = 'c8ca6210a41bfb79d8b80c9674c07814bebe1c8b141df1b6704f5e53fe603f11'
 'backend/tests/instalaciones-administracion-altas-fase1.test.js' = '6b28a5a43e8aafb0901f19a5dad73fc5cc5ca8fd643a2e91152fafb17e88bea7'
 'tests/instalaciones-administracion-altas-fase2.test.js' = '4835181bd87c3f5e8c6955353d26089184a32ac166bc38cb122d22dc5214c753'
 'tests/instalaciones-administracion-altas-fase3-formulas.test.js' = '413a98a5b97ec12e05972bf4b3e57ab26b7ea68c3319dd6a41462e0e4f85ba8e'
}
foreach($path in $shaExpected.Keys) {
 if(-not (Test-Path $path)) { throw "Falta fase previa: $path" }
 if((Get-FileHash -Algorithm SHA256 -LiteralPath $path).Hash.ToLowerInvariant() -ne $shaExpected[$path]) {
   throw "Archivo F1-F3 distinto: $path. Conciliar; NO sobreescribir."
 }
}
$new = @(
 'backend/src/modules/instalaciones-administracion/instalaciones-administracion-altas-persist.js',
 'backend/src/modules/instalaciones-administracion/instalaciones-administracion-altas-origin.js',
 'backend/src/modules/instalaciones-administracion/instalaciones-administracion-altas-sync-guard.js',
 'backend/tests/instalaciones-administracion-altas-fase4.test.js'
)
foreach($path in $new) { if(Test-Path -LiteralPath $path){throw "Archivo F4 ya existe: $path"} }
$loader='core/module-loader.js'; $sw='service-worker.js'
$oldJs="'./modules/instalaciones-administracion/instalaciones-administracion-altas-captura_cor.js?v=20261020-altas-f3-v001'"
$newJs="'./modules/instalaciones-administracion/instalaciones-administracion-altas-captura_cor.js?v=20261020-altas-f4-v001'"
$oldCss="'./modules/instalaciones-administracion/instalaciones-administracion-altas-captura_cor.css?v=20261020-altas-f2-v001'"
$newCss="'./modules/instalaciones-administracion/instalaciones-administracion-altas-captura_cor.css?v=20261020-altas-f4-v001'"
$oldSw="const SERVICE_WORKER_VERSION = '20261020-instalaciones-altas-f3-v001';"
$newSw="const SERVICE_WORKER_VERSION = '20261020-instalaciones-altas-f4-v001';"
$loaderText=[System.IO.File]::ReadAllText((Resolve-Path $loader).Path)
$swText=[System.IO.File]::ReadAllText((Resolve-Path $sw).Path)
foreach($text in @($oldJs,$oldCss)) {
 if($loaderText.Split([string[]]@($text),[System.StringSplitOptions]::None).Count -ne 2) {
   throw 'El loader no coincide con F3: DETENER y conciliar.'
 }
}
if($swText.Split([string[]]@($oldSw),[System.StringSplitOptions]::None).Count -ne 2) {
 throw 'SW no coincide con F3: DETENER y conciliar.'
}
$route='backend/src/modules/instalaciones-administracion/instalaciones-administracion.routes.js'
if(-not (Select-String -Path $route -SimpleMatch "router.post('/administracion/altas'" -Quiet)) {
 throw 'Fase 1 incompleta: ruta de POST ausente.'
}
$backup=Join-Path $env:TEMP ('BLTNOW_F4_backup_'+(Get-Date -Format yyyyMMdd_HHmmss))
foreach($p in @($loader,$sw)+@($gitExpected.Keys)+@($shaExpected.Keys)) {
 $dest=Join-Path $backup $p
 New-Item -ItemType Directory -Force -Path (Split-Path -Parent $dest) | Out-Null
 Copy-Item -LiteralPath $p -Destination $dest -ErrorAction Stop
}
Write-Host "Respaldo local previo: $backup"
# Aplicar archivos completos SOLO tras pasar TODO el preflight.
Expand-Archive -LiteralPath $ZIP -DestinationPath $REPO -Force
[System.IO.File]::WriteAllText((Resolve-Path $loader).Path,
  $loaderText.Replace($oldJs,$newJs).Replace($oldCss,$newCss),
  [System.Text.UTF8Encoding]::new($false))
[System.IO.File]::WriteAllText((Resolve-Path $sw).Path,
  $swText.Replace($oldSw,$newSw),[System.Text.UTF8Encoding]::new($false))
$checks=@($loader,$sw,'backend/src/routes/ins-fl.routes.js',
  'backend/src/jobs/instalacionesAdministracionCalculados.job.js',
  'backend/src/modules/instalaciones-administracion/instalaciones-administracion-altas.service.js',
  'backend/src/modules/instalaciones-administracion/instalaciones-administracion-altas-origin.js',
  'backend/src/modules/instalaciones-administracion/instalaciones-administracion-altas-persist.js',
  'backend/src/modules/instalaciones-administracion/instalaciones-administracion-altas-sync-guard.js',
  'backend/src/modules/instalaciones-administracion/instalaciones-administracion.auto-service.js',
  'modules/instalaciones-administracion/instalaciones-administracion-altas-captura_cor.js')
foreach($path in $checks) { node --check $path; if($LASTEXITCODE -ne 0){throw "Sintaxis fallida: $path"} }
node --test backend/tests/instalaciones-administracion-altas-fase1.test.js backend/tests/instalaciones-administracion-altas-fase4.test.js tests/instalaciones-administracion-altas-fase2.test.js tests/instalaciones-administracion-altas-fase3-formulas.test.js
if($LASTEXITCODE -ne 0){throw 'QA F1-F4 fallida. No publicar.'}
git diff --check
if($LASTEXITCODE -ne 0){throw 'Whitespace Git fallido.'}
git status --short
git diff --stat
```

Este bloque **no ejecuta** commit, push, deploy, SQL ni escrituras sobre Aiven. Conservar `$backup` para revertir **solo** los archivos intervenidos; no usar `git reset --hard`. Evitar publicar hasta Fase 5 y autorizacion.

## 4. QA y riesgos pendientes

- GitHub `main` verificado: `62eb487c` sin commits posteriores al HEAD utilizado en F3.
- Validacion aislada Node: **81/81 pruebas mock Fases 1-4 aprobadas**, combinadas; **17/17 especificas de Fase 4**.
- Sintaxis `node --check` en archivos JavaScript incluidos: correcta.
- Se revisaron politicas de Aiven desde la sabana historica. **NO se ha probado contra Aiven actual ni se ha hecho GET/POST real**.
- **Fase 5 pendiente:** suite completa historica de regresion, E2E con backend conectado a BD restaurada, autorizaciones reales, borradores y permisos, rechazo GAS 409/503 y reenvio del bloque, concurrencia, comprobacion de Excel frente a Aiven, refrescos de cache y PWA, aplicacion local sobre checkout real del usuario.
- No se cambia la estructura de BD. No se activan formulas nuevas para filas GAS historicas. El job diario, cuando se despliegue, puede actualizar campos de equipos creados manualmente conforme cambie la fecha de CDMX; se debe probar en respaldo antes de publicar.

**Estado de plataformas:** ninguna modificada: GitHub, Aiven, Azure, GitHub Pages y Netlify intactos. Sin instaladores ni `.patch`.
