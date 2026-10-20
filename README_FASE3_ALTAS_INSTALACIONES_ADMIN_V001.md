# BLT NOW — Instalaciones > Administración — Altas Fase 3 V001

**Fecha:** 20/10/2026. **Estado:** preparado para LOCAL, SIN despliegue.  
**Repositorio oficial revisado:** `ziSirrush/GestorMantto`, rama `main`, commit `62eb487c56cdbeab40f8a7c859d081782287702c` (verificado 20/10/2026). **Últimos commits desde Fase 2:** NO, `main` sigue en el mismo SHA; no alteraron esta Fase 3.  
**Base de integración:** aplicación LOCAL de las Fases 1 y 2 previamente entregadas. **Excel referencia:** `FieldLine Instalaciones.xlsx`, `Hoja1`, encabezados fila 1, ejemplo fila 2, fórmulas de texto fila 3.

## Alcance REAL de la Fase 3

- Las **siete fórmulas Excel** ahora se recalculan al instante **en memoria** por fila de la tabla de altas con edición fantasma. Las columnas calculadas son de **solo lectura**, no se envían en el borrador y no alteran `ins_fl`.
- También se previsualizan dos derivados ya definidos por el backend: `estatus_completo` y `dias_sin_ccnr`. Los demás campos originales y las 89 columnas de la captura Fase 2 permanecen.
- Motor puro idéntico en frontend y backend (archivos completos, SHA256 idéntico), preparado para que Fase 4 conecte la **persistencia autoritativa**. **Importante: la Fase 3 NO modifica el backend de Fase 1, ni los jobs existentes, ni habilita el botón Guardar lote.**
- Ante valores vacíos, marcadores `-`, fechas inválidas o divisiones entre cero, la previsualización devuelve `NULL`/guion visual, sin inventar datos. Fecha local operativa: `America/Mexico_City`.
- **AR y BB son SOLO PREVISTAS/SUGERENCIAS**, aunque el Excel titule las columnas «FIN ... REAL». Se muestran con la advertencia **«Fecha PREVISTA · no REAL»** y **no se escriben** como fechas de finalización real. La política definitiva de estas dos fechas sigue pendiente de decisión funcional.

## Mapa exacto de las 7 fórmulas desde Excel

Las expresiones están almacenadas como **TEXTO** (no como fórmulas ejecutables) y hacen referencia a la fila **2633**, aunque aparecen en la fila 3. Esta fase convierte sus referencias a campos de **cada equipo**:

| Celda/col. | Fórmula observada | Campo | Interpretación de vista previa |
|---|---|---|---|
| AG3 | `=SI.ERROR(SI($AF2633="-",$AE2633,$AF2633-(@DAYS(HOY(),$AJ2633)/30)),"-")` | `meses_garantia_restantes` | Si sitio vacío, meses actas; si no, sitio menos días desde descarga /30. Solo valor válido. |
| AR3 | `=SI(AQ2633="-",AP2633,AQ2633)` | `fecha_fin_montaje_real` | Mostrar fecha *prevista* modificada, o planeada si falta; NO registrar fecha REAL. |
| AS3 | `=SI.ERROR(SI(E2633="04-M",DIAS.LAB(HOY(),AR2633),"-"),"-")` | `dias_restantes` | Días laborables lunes-viernes, **incluidos ambos extremos**, con signo; solo `04-M`. Sin festivos adicionales (Excel no aporta lista). |
| BB3 | `=SI(BA2633="-",AZ2633,BA2633)` | `fecha_fin_ajuste_real` | Mostrar fecha *prevista* modificada o planeada; NO registrar fecha REAL. |
| BJ3 | `=SI.ERROR(AÑO(BG2633),"-")` | `anio_termino` | Año de `fecha_entrega_cliente` válida. |
| BU3 | `=DIAS360(F2633,HOY())` | `dias_sin_visita` | Días360 método US/NASD (sin tercer parámetro). |
| CC3 | `=SI.ERROR(CB2633/AD2633,"-")` | `costo_mensual_mantenimiento_cem` | Presupuesto / meses mantenimiento gratuito, no dividir por cero; formato monetario con 2 decimales **solo en presentación**. |

**Columna AR/BB — decisión pendiente:** El usuario todavía no ha aprobado que una fecha planeada se convierta en «real». Esta Fase 3 se abstiene de mutar el campo real y preserva el nombre de columna por compatibilidad visual, con etiqueta de advertencia.

**Diferencia con cálculos existentes:** el job `instalacionesAdministracionCalculados.job.js` y `auto-rules.js` actualmente utilizan días naturales para `dias_sin_visita` y `dias_restantes`; las fórmulas Excel exigen `DIAS360` y `DIAS.LAB`. **No cambiamos el job en esta fase para evitar recalcular miles de datos históricos sin autorización.** La Fase 4 debe resolver la autoridad/compatibilidad con el job antes de habilitar persistencia de fórmulas y guardado productivo. Por eso los valores de Fase 3 son **previsualizaciones, no resultados certificados en Aiven**.

## Archivos entregados COMPLETOS (sin instalador ni `.patch`)

1. **MODIFICADO desde la Fase 2:** `modules/instalaciones-administracion/instalaciones-administracion-altas-captura_cor.js`.
2. **NUEVO:** `modules/instalaciones-administracion/instalaciones-administracion-altas-formulas_cor.js`.
3. **NUEVO:** `backend/src/modules/instalaciones-administracion/instalaciones-administracion-altas-formulas.js`.
4. **NUEVO:** `tests/instalaciones-administracion-altas-fase3-formulas.test.js`.

El README, manifest y SHA256SUMS acompañan el paquete; no hay archivos `.sql`, migraciones, instaladores ni `patch`.

## Aplicación LOCAL con PowerShell (NO publica ni hace commit)

**Requisitos:** F1 y F2 aplicadas en local, con el cambio del `core/module-loader.js` y `service-worker.js` documentado en el README de F2. Guardar previamente tus cambios locales. Ejecutar desde PowerShell en Windows:

```powershell
$REPO = 'C:\Users\T14s\Downloads\mantto_gestor_frontend'
$ZIP = "$env:USERPROFILE\Downloads\BLTNOW_FASE3_ALTAS_INSTALACIONES_ADMIN_V001.zip"
Set-Location $REPO
if (-not (Test-Path -LiteralPath $ZIP)) { throw 'No se encontro el ZIP Fase 3.' }
$CAPTURE = 'modules/instalaciones-administracion/instalaciones-administracion-altas-captura_cor.js'
$LOADER = 'core/module-loader.js'
$SW = 'service-worker.js'
$SHA_F2 = 'ac6487a29a7c8cef71ee874dedaea813c91f8490c3d60519a85186cbb812eb59'
if (-not (Test-Path -LiteralPath $CAPTURE)) { throw 'Fase 2 no instalada: falta archivo de captura.' }
if ((Get-FileHash -Algorithm SHA256 -LiteralPath $CAPTURE).Hash.ToLowerInvariant() -ne $SHA_F2) {
  throw 'Archivo de captura Fase 2 modificado o version distinta; DETENER sin sobreescribir.'
}
$NEW = @(
 'modules/instalaciones-administracion/instalaciones-administracion-altas-formulas_cor.js',
 'backend/src/modules/instalaciones-administracion/instalaciones-administracion-altas-formulas.js',
 'tests/instalaciones-administracion-altas-fase3-formulas.test.js'
)
foreach($p in $NEW) { if(Test-Path -LiteralPath $p) { throw "Ya existe $p; DETENER y conciliar." } }
$OLD_JS = "'./modules/instalaciones-administracion/instalaciones-administracion-altas-captura_cor.js?v=20261020-altas-f2-v001'"
$NEW_CALC = "'./modules/instalaciones-administracion/instalaciones-administracion-altas-formulas_cor.js?v=20261020-altas-f3-v001'"
$NEW_JS = "'./modules/instalaciones-administracion/instalaciones-administracion-altas-captura_cor.js?v=20261020-altas-f3-v001'"
$OLD_SW = "const SERVICE_WORKER_VERSION = '20261020-instalaciones-altas-f2-v001';"
$NEW_SW = "const SERVICE_WORKER_VERSION = '20261020-instalaciones-altas-f3-v001';"
$loaderText = [System.IO.File]::ReadAllText((Resolve-Path $LOADER).Path)
$swText = [System.IO.File]::ReadAllText((Resolve-Path $SW).Path)
if ($loaderText.Split([string[]]@($OLD_JS),[System.StringSplitOptions]::None).Count -ne 2) {
  throw 'El loader NO coincide con Fase 2. Conciliar sin alterar.'
}
if ($loaderText.Contains($NEW_CALC) -or $loaderText.Contains($NEW_JS)) { throw 'Fase 3 ya integrada.' }
if ($swText.Split([string[]]@($OLD_SW),[System.StringSplitOptions]::None).Count -ne 2) {
  throw 'El Service Worker NO coincide con Fase 2. Conciliar sin alterar.'
}
$BACKUP = Join-Path $env:TEMP ('BLTNOW_F3_backup_' + (Get-Date -Format yyyyMMdd_HHmmss))
New-Item -ItemType Directory -Path $BACKUP -Force | Out-Null
Copy-Item $CAPTURE (Join-Path $BACKUP 'captura_f2.js')
Copy-Item $LOADER (Join-Path $BACKUP 'module-loader_f2.js')
Copy-Item $SW (Join-Path $BACKUP 'service-worker_f2.js')
Write-Host "Respaldos en: $BACKUP"
# Solo ahora se sustituyen archivos completos del ZIP.
Expand-Archive -LiteralPath $ZIP -DestinationPath $REPO -Force
[System.IO.File]::WriteAllText((Resolve-Path $LOADER).Path,
  $loaderText.Replace($OLD_JS, $NEW_CALC + ',' + $NEW_JS),
  [System.Text.UTF8Encoding]::new($false))
[System.IO.File]::WriteAllText((Resolve-Path $SW).Path,
  $swText.Replace($OLD_SW, $NEW_SW),
  [System.Text.UTF8Encoding]::new($false))
node --check $LOADER
if ($LASTEXITCODE -ne 0) { throw 'Error sintaxis module-loader; recuperar backup.' }
node --check $SW
if ($LASTEXITCODE -ne 0) { throw 'Error sintaxis Service Worker; recuperar backup.' }
node --check $CAPTURE
if ($LASTEXITCODE -ne 0) { throw 'Error sintaxis captura; recuperar backup.' }
node --test .\backend\tests\instalaciones-administracion-altas-fase1.test.js .\tests\instalaciones-administracion-altas-fase2.test.js .\tests\instalaciones-administracion-altas-fase3-formulas.test.js
if ($LASTEXITCODE -ne 0) { throw 'QA F1-F3 no aprobada; NO publicar.' }
git diff --check
if ($LASTEXITCODE -ne 0) { throw 'git diff --check fallido.' }
git status --short
git diff --stat
```

**Reversión LOCAL:** usar los tres respaldos del directorio `$BACKUP` únicamente después de verificar que nadie los editó posteriormente; retirar exclusivamente los 3 archivos NUEVOS de F3. No usar `git reset --hard`. **No ejecutar sobre versión distinta**: si la Fase 2 no fue instalada exactamente como se entregó, detenerse y conciliar.

## Validaciones y límites de evidencia

- Se revisó Excel con `openpyxl` sin modificar el libro: 89 encabezados en Hoja1, 7 expresiones textuales en AG3/AR3/AS3/BB3/BJ3/BU3/CC3, ejemplo fila 2.
- Se verificó `main` vigente en GitHub `62eb487c` y que no avanzó desde la Fase 2.
- `node --check`: 4/4 JS sin errores.
- `node --test`: **62/62 pruebas simuladas F1 + F2 + F3**, sin acceso a MySQL. F3 incluye 24 pruebas: ejemplo AG=24, AS=-6, BU=32, CC=2649 (corte 16/10/2026), nulos, fechas y sugerencias.
- **NO ejecutado:** aplicación en checkout del usuario, pruebas visuales en navegador, Aiven real, job real, auditoría BD, E2E, despliegues, commits o publicación.
- **No modificado:** GitHub, Aiven MySQL, Azure, Netlify, GitHub Pages.

**Fase 4:** no habilitar `Guardar lote` hasta que el backend integre oficialmente las fórmulas y se resuelva la discrepancia con el job diario, el tratamiento de AR/BB y la convivencia GAS. La F3 es una vista previa calculada, no una migración de datos.
