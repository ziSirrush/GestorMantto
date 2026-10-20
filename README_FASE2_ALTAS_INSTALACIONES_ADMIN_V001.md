# BLT NOW — Instalaciones > Administración — Altas Fase 2 V001

**Fecha:** 20/10/2026. **Estado:** entregable LOCAL, sin despliegue.
**Código comprobado:** `ziSirrush/GestorMantto`, `main` commit `62eb487c56cdbeab40f8a7c859d081782287702c`.
**Comparación:** respecto de la base Fase 1 `e6ff69a39343a77583f7bc1f7a254c2661de5883`, `main` avanzó 2 commits relativos a modo offline, auth, router, SW y actualizaciones. **¿Afectan a la integración de las fases? SÍ:** el Service Worker reciente utiliza caché estática **cache-first** (incluido `core/module-loader.js`). Por eso, sin cambiar la versión del SW, el frontend puede cargar un loader obsoleto. Se actualiza de forma localizada el número de versión del SW. No cambiaron los archivos propios de Instalaciones; la entrada original `instalaciones-administracion` del loader sigue igual. Loader actual: blob `8ee82edce0e36975637fc39a6a1134094d368c8d`, SW actual: blob `56ea3eaae1d19c17b714ed4942186c0fb1fbbc3c`.

## Alcance Fase 2

- Botón **+ Agregar nuevo**, visible solo para usuario con permiso `EDITAR`, acceso visual, contrato de grupos autorizado y fuera del modo Visor.
- Vista de captura para **1 a 20 equipos**, uno por fila, mismo diseño/semántica de tabla con **edición fantasma**; acepta proyectos iguales o diferentes.
- **89 columnas del módulo** desde el contrato de grupos existente para editor completo, con scroll horizontal. Se añade **PP NS** únicamente en captura como columna de identidad adicional (la tabla histórica lo mantiene oculto).
- Las celdas se editan por clic y permanecen en memoria del navegador **solo mientras se captura**. Vacíos opcionales = `NULL`. Borrador desaparece al salir, cerrar o cambiar de identidad; no usa `localStorage`, `sessionStorage`, IndexedDB ni POST.
- Calculados existentes y cinco fórmulas reservadas para Fase 3 son de **solo lectura**. Las fórmulas del Excel no se adelantan ni cambian en esta fase.
- Alertas preventivas de identidad incompleta, referencia duplicada y PP NS asignado a nombres incompatibles.
- Botón **Guardar lote (Fase 4)** expresamente desactivado. La Fase 4 activará POST, confirmación y recarga. Ningún dato nuevo se envía a Aiven desde Fase 2.

## Archivos entregados (COMPLETOS, nuevos, rutas relativas)

1. `modules/instalaciones-administracion/instalaciones-administracion-altas-captura_cor.js`
2. `modules/instalaciones-administracion/instalaciones-administracion-altas-captura_cor.css`
3. `tests/instalaciones-administracion-altas-fase2.test.js`
4. README (este archivo).

**Integración segura:** no se sobrescriben archivos completos `core/module-loader.js` ni `service-worker.js` porque ambos recibieron cambios recientes ajenos a Instalaciones. El bloque PowerShell realiza dos sustituciones exactas en la entrada del módulo y un cambio de versión del SW, con copias de respaldo y comparación de blob Git antes de escribir. Es una integración **local verificable**, no un instalador ni un `.patch`. Los archivos nuevos incluidos sí son completos. Sin migraciones ni cambios de esquema.

## Aplicación LOCAL — PowerShell (NO publica)

**Requisito:** ya debió aplicarse la Fase 1 a tu backend local. Antes de comenzar, resguarda cualquier trabajo y comprueba `git status --short`.

```powershell
$REPO = 'C:\Users\T14s\Downloads\mantto_gestor_frontend'
$ZIP = "$env:USERPROFILE\Downloads\BLTNOW_FASE2_ALTAS_INSTALACIONES_ADMIN_V001.zip"
Set-Location $REPO
$EXPECTED_LOADER_BLOB = '8ee82edce0e36975637fc39a6a1134094d368c8d'
$EXPECTED_SW_BLOB = '56ea3eaae1d19c17b714ed4942186c0fb1fbbc3c'
$loaderFile = 'core/module-loader.js'
$swFile = 'service-worker.js'
if ((git hash-object $loaderFile).Trim() -ne $EXPECTED_LOADER_BLOB) {
  throw 'core/module-loader.js difiere del main revisado. Detener y conciliar, sin sobreescribir.'
}
if ((git hash-object $swFile).Trim() -ne $EXPECTED_SW_BLOB) {
  throw 'service-worker.js difiere del main revisado. Detener y conciliar, sin sobreescribir.'
}
$paths = @(
  'modules/instalaciones-administracion/instalaciones-administracion-altas-captura_cor.js',
  'modules/instalaciones-administracion/instalaciones-administracion-altas-captura_cor.css',
  'tests/instalaciones-administracion-altas-fase2.test.js'
)
foreach($path in $paths) {
  if(Test-Path -LiteralPath $path) { throw "Ya existe: $path. Detener y conciliar." }
}
Expand-Archive -LiteralPath $ZIP -DestinationPath $REPO -Force

$jsOld = "'./modules/instalaciones-administracion/instalaciones-administracion_cor.js?v=20261013-integral-fix-v001'"
$jsNew = "'./modules/instalaciones-administracion/instalaciones-administracion-altas-captura_cor.js?v=20261020-altas-f2-v001'"
$cssOld = "'./modules/instalaciones-administracion/instalaciones-administracion-ghost_cor.css?v=20261013-integral-fix-v001'"
$cssNew = "'./modules/instalaciones-administracion/instalaciones-administracion-altas-captura_cor.css?v=20261020-altas-f2-v001'"
$loaderText = [System.IO.File]::ReadAllText((Resolve-Path $loaderFile).Path)
if($loaderText.Split(@($jsOld),[System.StringSplitOptions]::None).Count -ne 2) {
  throw 'La entrada JS del loader no coincide: NO integrar.'
}
if($loaderText.Split(@($cssOld),[System.StringSplitOptions]::None).Count -ne 2) {
  throw 'La entrada CSS del loader no coincide: NO integrar.'
}
if($loaderText.Contains($jsNew) -or $loaderText.Contains($cssNew)) {
  throw 'Fase 2 ya integrada o parcialmente integrada. Detener.'
}
$backup = Join-Path $env:TEMP 'BLTNOW_F2_module-loader_backup.js'
$backupSw = Join-Path $env:TEMP 'BLTNOW_F2_service-worker_backup.js'
Copy-Item -LiteralPath $loaderFile -Destination $backup -ErrorAction Stop
Copy-Item -LiteralPath $swFile -Destination $backupSw -ErrorAction Stop
$swText = [System.IO.File]::ReadAllText((Resolve-Path $swFile).Path)
$swOld = "const SERVICE_WORKER_VERSION = '20261020-offline-shell-v001';"
$swNew = "const SERVICE_WORKER_VERSION = '20261020-instalaciones-altas-f2-v001';"
if(-not $swText.Contains($swOld)) { throw 'Version de SW no prevista: detener.' }
$loaderText = $loaderText.Replace($jsOld, $jsOld + ',' + $jsNew)
$loaderText = $loaderText.Replace($cssOld, $cssOld + ',' + $cssNew)
[System.IO.File]::WriteAllText((Resolve-Path $loaderFile).Path, $loaderText, [System.Text.UTF8Encoding]::new($false))
[System.IO.File]::WriteAllText((Resolve-Path $swFile).Path, $swText.Replace($swOld,$swNew), [System.Text.UTF8Encoding]::new($false))
node --check service-worker.js
if($LASTEXITCODE -ne 0) { throw 'Error de sintaxis en SW; recuperar backup local.' }
node --check core/module-loader.js
if($LASTEXITCODE -ne 0) { throw 'Error de sintaxis en loader; recuperar backup local.' }
node --check modules/instalaciones-administracion/instalaciones-administracion-altas-captura_cor.js
if($LASTEXITCODE -ne 0) { throw 'Error de sintaxis en modulo; detener.' }
node --test tests/instalaciones-administracion-altas-fase2.test.js
if($LASTEXITCODE -ne 0) { throw 'QA Fase 2 fallida; detener.' }
git diff --check
if($LASTEXITCODE -ne 0) { throw 'Cambios con errores de whitespace.' }
git status --short
git diff --stat
```

**Precaución:** si tu rama/carpeta tiene versiones diferentes de loader/SW, **NO ejecutes el reemplazo sobre una base desconocida**. El bloque falla cerrado. El comando `Expand-Archive` incorpora tres recursos nuevos y este README, sin sustituir archivos existentes; el loader se actualiza despues con reemplazo exacto y backup.

## Verificación de este entregable

- JS `node --check`: PASS.
- Pruebas puras Node: **15/15 PASS**; sin conexión a Aiven. Valida contrato 93→89, filtros, nulos, permisos, duplicados, ausencia de mutaciones y límite 20.
- Comparación GitHub `e6ff69a..62eb487`: revisada; sin cambios en `modules/instalaciones-administracion/` ni backend de altas. Un cambio a `core/module-loader.js` solo modificó `offline-configuracion`, pero el cambio de SW introdujo caché estática cache-first. **Sí afecta la invalidación de caché**: requiere nueva versión del SW; ambos archivos se protegen con preflight.
- NO realizado: integración efectiva sobre tu checkout, pruebas visuales de navegador, QA E2E, escrituras Aiven, despliegue, `git commit`, `git push`.

## Reversión local

Los cambios de loader/SW pueden revertirse recuperando **ambos backups creados por PowerShell**, tras validar que no haya cambios posteriores de otras personas en esos archivos. Retirar únicamente los dos recursos nuevos y la prueba si es necesario. No borrar otros archivos ni usar `git reset --hard`.

**Plataformas:** GitHub, Azure, Aiven, Netlify y GitHub Pages sin modificaciones.
