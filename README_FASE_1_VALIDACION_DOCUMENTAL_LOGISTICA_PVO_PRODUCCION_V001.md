# BLT NOW - Fase 1 - Validacion documental de Logistica / PVO / Produccion V001

**Fecha:** 21/10/2026  
**Origen verificado:** `ziSirrush/GestorMantto`, rama `main`, commit `97a0a30a0d269629754afad07dfc054ea9ac831a` (`Version 102026.14`).  
**Estado:** FIX backend preparado y probado de forma aislada; **NO aplicado** al repositorio remoto, Aiven, Azure ni Netlify.

## Regla funcional implementada

Se considera **documentacion completa** cuando, en el **mismo `id_produccion`**, existen al menos:

1. **1 archivo activo tipo `CPVO`**, y
2. **1 archivo activo tipo `GM`** (documento complementario).

Unicamente GM, unicamente CPVO, dos CPVO sin GM, o varias GM sin CPVO siguen **INCOMPLETOS**. Los archivos con `activo=0` no cuentan. No se relacionan archivos por el nombre del proyecto: se conserva el control vigente de identidad PPNS.

**Limitacion verificada:** el esquema existente de `logistica_produccion_archivos` admite solo `CPVO` y `GM`; no hay un tipo independiente para "carta de primera visita". Esta Fase 1 valida la condicion inicial mediante `CPVO` activo y **no inventa reconocimiento de carta por nombre de archivo**. Si la carta de primera visita es una categoria distinta de CPVO, requiere definir su representacion antes de ampliar el validador.

## Cambios

- `backend/src/modules/logistica-produccion/logistica-produccion.service.js`: regla central `documentationComplete()`, indicador `FALTAN_DOCS_PROD`, `documentacion_completa`, metadato de regla, `/documentos/faltantes` y PVO completos/faltantes. **Se conservan** las fechas PVO y fecha de visita como requisitos independientes.
- `backend/src/modules/logistica-produccion/logistica-produccion.repository.js`: filtro `sin_documentos` o `vista=sin_documentos` considera faltante CPVO **o** GM; reutiliza el agregado SQL de archivos **activos**.
- `tests/logistica_produccion_validacion_documental_fase1_v001.test.js`: 14 pruebas aisladas de combinaciones, filtros, PVO, PPNS y regresiones.

**Base de datos:** sin `ALTER`, migracion, cambios de tabla, columnas o indices.  
**Frontend:** sin cambios en Fase 1. La Fase 2 ajustara textos/leyendas y mostrara la razon concreta de la documentacion incompleta (actualmente algunas filas PVO pueden mostrar fechas/CPVO correctas sin indicar que falta GM). **No promover a produccion solo Fase 1 sin validar la Fase 2.**

## Validaciones realizadas

- Version original de los dos archivos verificada por blob SHA GitHub:
  - service: `0aa8595e6b38719904cfff392fe4959c17d6c7d8`.
  - repository: `d3de96617d6034a27eaea38f60cf4a6d3cec93c6`.
- `node --check`: OK (ambos backend y test).
- `node --test tests/logistica_produccion_validacion_documental_fase1_v001.test.js`: **14/14 PASS**, mocks, sin servicios externos.
- `git diff --check`: OK, revision local aislada.
- **No realizados:** prueba contra Aiven productivo, arranque completo en Azure, E2E, commit local del usuario, push, despliegue.

## Aplicacion local - PowerShell (sin push ni publicacion)

El ZIP conserva rutas originales y contiene archivos **completos**, no parches ni instaladores. Ajustar `$REPO` a la ubicacion local real. Se requiere arbol limpio y exactamente el commit base, para no sobrescribir trabajo reciente.

```powershell
$ErrorActionPreference = 'Stop'
$REPO = 'C:\Users\T14s\Downloads\mantto_gestor_frontend' # Cambiar si corresponde
$ZIP = Join-Path $HOME 'Downloads\FIX_BLT_NOW_FASE_1_VALIDACION_DOCUMENTAL_V001.zip'
$BASE = '97a0a30a0d269629754afad07dfc054ea9ac831a'
Set-Location $REPO
if ((git rev-parse HEAD).Trim() -ne $BASE) { throw 'BASE DISTINTA: revisar y adaptar; no sobrescribir.' }
if (@(git status --porcelain).Count -gt 0) { throw 'Repositorio con cambios sin guardar; detenerse.' }
if (-not (Test-Path -LiteralPath $ZIP)) { throw 'No se encontro el ZIP.' }
$FILES = @(
  'backend\src\modules\logistica-produccion\logistica-produccion.service.js',
  'backend\src\modules\logistica-produccion\logistica-produccion.repository.js',
  'tests\logistica_produccion_validacion_documental_fase1_v001.test.js'
)
$EXPECTED = @{}
$EXPECTED[$FILES[0]] = '0aa8595e6b38719904cfff392fe4959c17d6c7d8'
$EXPECTED[$FILES[1]] = 'd3de96617d6034a27eaea38f60cf4a6d3cec93c6'
foreach ($f in $FILES[0..1]) {
  $sha = (git hash-object -- (Join-Path $REPO $f)).Trim()
  if ($sha -ne $EXPECTED[$f]) { throw "Contenido local distinto: $f" }
}
$TEMP = Join-Path $env:TEMP 'BLT_NOW_DOCS_FASE1_V001'
New-Item -ItemType Directory -Path $TEMP -Force | Out-Null
Expand-Archive -LiteralPath $ZIP -DestinationPath $TEMP -Force
foreach ($f in $FILES) {
  $src = Join-Path $TEMP $f
  $dst = Join-Path $REPO $f
  if (-not (Test-Path -LiteralPath $src)) { throw "Archivo ausente: $f" }
  New-Item -ItemType Directory -Path (Split-Path -Parent $dst) -Force | Out-Null
  Copy-Item -LiteralPath $src -Destination $dst -Force
  node --check $dst
  if ($LASTEXITCODE -ne 0) { throw "Error de sintaxis: $f" }
}
node --test 'tests\logistica_produccion_validacion_documental_fase1_v001.test.js'
if ($LASTEXITCODE -ne 0) { throw 'Fallo en pruebas.' }
git diff --check
if ($LASTEXITCODE -ne 0) { throw 'Fallo en git diff --check.' }
git status --short
git diff --stat
# Tras revisar cambios y tener pruebas de integracion satisfactorias:
# git add -- backend/src/modules/logistica-produccion/logistica-produccion.service.js backend/src/modules/logistica-produccion/logistica-produccion.repository.js tests/logistica_produccion_validacion_documental_fase1_v001.test.js
# git commit -m "fix(logistica): exigir CPVO y GM para completar documentos"
# SIN git push, SIN despliegue
```

> El ZIP contiene el README para trazabilidad; no debe copiarse al runtime del backend. Si `main` o el arbol local han cambiado, detenerse y volver a comparar con la base actual.
