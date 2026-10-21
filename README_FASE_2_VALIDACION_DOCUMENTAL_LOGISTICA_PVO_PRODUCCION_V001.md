# BLT NOW — Fase 2 — Validación documental de Logística, PVO y Producción V001

**Fecha:** 21/10/2026  
**Base verificable:** `ziSirrush/GestorMantto`, rama `main`, commit `97a0a30a0d269629754afad07dfc054ea9ac831a` (`Version 102026.14`).  
**Estado:** FIX **preparado localmente y validado por pruebas aisladas**. Sin escrituras a GitHub, Aiven, Azure ni Netlify. Sin ejecución E2E productiva.

## Objetivo y dependencia

Complementa la **Fase 1 del mismo FIX** (`FIX_BLT_NOW_FASE_1_VALIDACION_DOCUMENTAL_V001.zip`), que modifica la validación documental del backend. **Aplicar Fase 1 antes de usar Fase 2**.

La documentación se considera **completa** únicamente si, para el mismo `id_produccion`, hay **al menos 1 CPVO activa y 1 GM activa**. Una única CPVO, una única GM, varias del mismo tipo o ningún archivo quedan **incompletos**. El backend es la autoridad de esta validación. Los otros criterios ya vigentes de fechas, PPNS, autorización e identidad del proyecto no se alteran.

**Límite de la fuente:** la tabla vigente admite tipos `CPVO` y `GM`. No se crea ni reconoce automáticamente un tipo separado de «carta de primera visita»; si tal carta no se registra como `CPVO`, se requiere otra definición funcional antes de incorporarla.

## Modificaciones de Fase 2 (solo frontend)

1. `modules/logistica-produccion/logistica-produccion.js`: archivo **completo**; indicadores/documentación incompleta y razones concretas; PVO completos/faltantes muestran CPVO y GM en columnas separadas y preservan fechas; listado «Documentación incompleta» no confunde «falta un tipo» con «sin archivos»; Detalle expone estado, mínimo requerido y refresca después de carga/eliminación según flujo existente.
2. `core/module-loader.js`: archivo **completo**; cache-bust del **JS** únicamente en las cinco rutas relacionadas (`logistica-produccion`, `logistica-produccion-nuevo`, `logistica-produccion-detalle`, `logistica-pvo` y `logistica-documentos`). No se alteran rutas, CSS ni el cache-bust de módulos ajenos.
3. `tests/logistica_produccion_validacion_documental_fase2_v001.test.js`: 20 pruebas de comportamiento visual con un DOM HTTP simulado, sin llamadas externas.

**No incluidos ni modificados:** backend, SQL, tablas, migraciones, CSS, instaladores, archivos `.patch`, deploy scripts, módulos en Nevera.

## Validaciones (ejecutadas)

- Fuente original cotejada por blob SHA de GitHub: `modules/logistica-produccion/logistica-produccion.js` → `3d2a7cb5b9cf4bb28a3902d171ffb6fa1377077b`; `core/module-loader.js` → `8a8ab6b1f2660a8c10637849553a8bece740dc0c`.
- `node --check` de los archivos JS de Fase 2 y de Fase 1: **PASS**.
- `node --test tests/logistica_produccion_validacion_documental_fase2_v001.test.js`: **20/20 PASS** (mock, no E2E).
- Prueba integrada aislada con los archivos de Fase 1 y Fase 2: **34/34 PASS**.
- `git diff --check`: **PASS**, revisión de cambios aislados solo para Fase 2.
- **Pendiente:** E2E real con API Azure/Aiven y verificación en móvil/tableta; comprobación final tras instalación local. No se efectuó `COMMIT`, `PUSH` ni despliegue.

## Aplicación local PowerShell — sin publicar

Este ZIP contiene archivos completos en sus rutas; **no se ejecutan instaladores ni parches**. Aplicar **después** de Fase 1. Ajustar `$REPO` si corresponde. El proceso **comprueba los hashes de ambos archivos que se reemplazarán**, así que no sobrescribe modificaciones distintas sin autorización. Admite que los backend de Fase 1 ya estén modificados y sin commit.

```powershell
$ErrorActionPreference = 'Stop'
$REPO = 'C:\Users\T14s\Downloads\mantto_gestor_frontend' # Ajustar
$ZIP = Join-Path $HOME 'Downloads\FIX_BLT_NOW_FASE_2_VALIDACION_DOCUMENTAL_V001.zip'
$BASE = '97a0a30a0d269629754afad07dfc054ea9ac831a'
Set-Location $REPO
if (-not (Test-Path -LiteralPath $ZIP)) { throw 'No se encontró el ZIP de Fase 2.' }
git merge-base --is-ancestor $BASE HEAD
if ($LASTEXITCODE -ne 0) { throw 'La rama actual no contiene la base validada; detenerse.' }
$FILES = @(
  'modules\logistica-produccion\logistica-produccion.js',
  'core\module-loader.js',
  'tests\logistica_produccion_validacion_documental_fase2_v001.test.js'
)
$EXPECTED = @{
  'modules\logistica-produccion\logistica-produccion.js' = '3d2a7cb5b9cf4bb28a3902d171ffb6fa1377077b'
  'core\module-loader.js' = '8a8ab6b1f2660a8c10637849553a8bece740dc0c'
}
foreach ($f in $FILES[0..1]) {
  $local = Join-Path $REPO $f
  if (-not (Test-Path -LiteralPath $local)) { throw "Falta archivo original: $f" }
  if ((git hash-object -- $local).Trim() -ne $EXPECTED[$f]) { throw "Archivo modificado respecto a base: $f. NO sobrescribir." }
}
if (Test-Path -LiteralPath (Join-Path $REPO $FILES[2])) { throw 'El archivo de pruebas de Fase 2 ya existe; revisar antes de sobrescribir.' }
$FASE1 = Join-Path $REPO 'tests\logistica_produccion_validacion_documental_fase1_v001.test.js'
if (-not (Test-Path -LiteralPath $FASE1)) { throw 'Aplicar previamente la Fase 1 del FIX.' }
$TEMP = Join-Path $env:TEMP 'BLTNOW_DOC_FASE2_V001'
New-Item -ItemType Directory -Force -Path $TEMP | Out-Null
Expand-Archive -LiteralPath $ZIP -DestinationPath $TEMP -Force
foreach ($f in $FILES) {
  $src = Join-Path $TEMP $f
  if (-not (Test-Path -LiteralPath $src)) { throw "Falta archivo de entrega: $f" }
}
$BACKUP = Join-Path $TEMP 'respaldo_previo'
foreach ($f in $FILES[0..1]) {
  $bak = Join-Path $BACKUP $f
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $bak) | Out-Null
  Copy-Item -LiteralPath (Join-Path $REPO $f) -Destination $bak -Force
}
foreach ($f in $FILES) {
  $dest = Join-Path $REPO $f
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $dest) | Out-Null
  Copy-Item -LiteralPath (Join-Path $TEMP $f) -Destination $dest -Force
  node --check $dest
  if ($LASTEXITCODE -ne 0) { throw "Fallo de sintaxis: $f. Restaurar desde $BACKUP" }
}
node --test $FASE1 (Join-Path $REPO $FILES[2])
if ($LASTEXITCODE -ne 0) { throw "Pruebas fallidas. Restaurar los dos JS de $BACKUP" }
git diff --check
if ($LASTEXITCODE -ne 0) { throw 'git diff --check falló.' }
git status --short
git diff --stat
# Revisar antes de un eventual commit local; NO git push ni desplegar.
```

**Promoción:** Local → GitHub Pages (validación online) → Netlify producción (manual) **solo después de aprobación expresa y pruebas**. Backend en Azure se promueve también únicamente con autorización independiente. Este ZIP no aplica ni publica cambios.
