# BLT NOW — Fase 1 · Filtro "Buscar proyecto" PVO-Producción V001

**Fecha:** 21/10/2026  
**Fuente de código verificada:** `ziSirrush/GestorMantto`, `main`, commit `97a0a30a0d269629754afad07dfc054ea9ac831a` (versión `102026.14`).  
**Archivo original:** `backend/src/modules/logistica-produccion/logistica-produccion.repository.js` — Git blob SHA `d3de96617d6034a27eaea38f60cf4a6d3cec93c6`.

## Requerimiento

En **PVO-Producción → Agregar nuevo → Buscar proyecto**, solo ofrecer registros de Logística cuyo `log_ops.estatus` se encuentre **antes de "EN PRODUCCION"**. Los demás buscadores, listados históricos y Detalle no deben verse afectados.

Se identificaron cuatro etapas anteriores en el catálogo `Logistica / Estatus Produccion` (órdenes 1–4 del dump de referencia del 07/10/2026; **no se afirma que el dump sea la BD productiva actual**):

1. `SIN PRODUCCIÓN / Documentación Pendiente`.
2. `SIN PRODUCCIÓN / Primera Visita a Obra`.
3. `SIN PRODUCCIÓN / Pendiente Liberación por Parte del Cliente`.
4. `SIN PRODUCCIÓN / Programados a Producción`.

Todas las etapas desde `EN PRODUCCION` (orden 5) hasta `ALMACENADOS` (orden 12), más valores vacíos o desconocidos, quedan fuera del alta nueva. La consulta mantiene el filtro existente por texto de proyecto/PPNS, y la marca `ya_registrado` que utiliza la UI.

## Cambio realizado

**Un único archivo de runtime modificado:** `backend/src/modules/logistica-produccion/logistica-produccion.repository.js`.

- `projectOptions()` (ruta `GET /api/logistica/produccion/manual/proyectos`) filtra en MySQL mediante los cuatro estatus permitidos y parámetros SQL, sin depender de un filtrado visual.
- `create()` comprueba nuevamente el estatus de `log_ops` **dentro de la transacción y bajo `FOR UPDATE`**, para bloquear nuevas altas si el equipo cambió a Producción después de aparecer en el buscador (respuesta 409). Conserva el control de identidad PPNS existente.
- No se modifican los endpoints de consulta histórica, Detalle, opciones PPNS semiautomáticas ni `UPDATE` de registros existentes. La UI actual de Detalle preserva el proyecto guardado mediante su valor de respaldo.

**Sin cambios:** Frontend, Fecha PVO, Fecha de Visita, tablas SQL, índices, catálogo, permisos, Aiven, Azure, Netlify y GitHub remoto. La eliminación de «Fecha de Visita» corresponde a la **Fase 2**.

**Archivo adicional:** `tests/logistica_produccion_filtro_preproduccion_fase1_v001.test.js`, pruebas locales simuladas que no acceden a BD.

## Verificaciones

- Revisión directa de `main` + SHA del archivo original: **correcta**.
- Sintaxis `node --check` (runtime y test): **correcta**.
- `node --test tests/logistica_produccion_filtro_preproduccion_fase1_v001.test.js`: **23/23 aprobadas**.
- `git diff --check` en copia aislada: **correcta**.
- **No probado:** consultas reales contra Aiven, pruebas E2E, integración real con Azure/Netlify. No se realizaron despliegues ni escrituras externas.

## Aplicación local segura — PowerShell

El ZIP contiene archivos **completos**, no instaladores ni `.patch`, y respeta sus rutas. Se entrega preparado, **sin aplicar al repositorio del usuario**. Ajustar `$REPO` a la ubicación real, y ubicar previamente el ZIP en `Descargas`.

**IMPORTANTE:** El fix parte de `main` sin otros cambios. Si aplicaste la Fase 1 documental anterior u otro arreglo que modificó este mismo archivo, **no sobrescribas**: los controles siguientes se detendrán. En ese caso hay que integrar ambos cambios sobre tu versión local para no perder trabajo.

```powershell
$ErrorActionPreference = 'Stop'
$REPO = 'C:\Users\T14s\Downloads\mantto_gestor_frontend' # Ajustar ruta
$ZIP = Join-Path $HOME 'Downloads\FIX_BLT_NOW_FASE_1_FILTRO_PREPRODUCCION_V001.zip'
$BASE = '97a0a30a0d269629754afad07dfc054ea9ac831a'
$ARCHIVO = 'backend\src\modules\logistica-produccion\logistica-produccion.repository.js'
$PRUEBA = 'tests\logistica_produccion_filtro_preproduccion_fase1_v001.test.js'

Set-Location $REPO
if ((git rev-parse HEAD).Trim() -ne $BASE) { throw 'BASE DISTINTA: no sobrescribir; revisar integracion.' }
if (@(git status --porcelain).Count -gt 0) { throw 'Arbol local con cambios: detenerse.' }
$ACTUAL = (git hash-object -- (Join-Path $REPO $ARCHIVO)).Trim()
if ($ACTUAL -ne 'd3de96617d6034a27eaea38f60cf4a6d3cec93c6') { throw 'Archivo modificado: detenerse para integrar sin perdida.' }
if (-not (Test-Path -LiteralPath $ZIP)) { throw 'ZIP no encontrado en Descargas.' }

$TEMP = Join-Path $env:TEMP 'BLTNOW_FILTRO_PREPRODUCCION_FASE1_V001'
New-Item -ItemType Directory -Path $TEMP -Force | Out-Null
Expand-Archive -LiteralPath $ZIP -DestinationPath $TEMP -Force
foreach ($f in @($ARCHIVO,$PRUEBA)) {
    $origen = Join-Path $TEMP $f
    $destino = Join-Path $REPO $f
    if (-not (Test-Path -LiteralPath $origen)) { throw "No existe $f en el ZIP." }
    New-Item -ItemType Directory -Path (Split-Path $destino -Parent) -Force | Out-Null
    Copy-Item -LiteralPath $origen -Destination $destino -Force
    node --check $destino
    if ($LASTEXITCODE -ne 0) { throw "Error de sintaxis en $f" }
}
node --test $PRUEBA
if ($LASTEXITCODE -ne 0) { throw 'Pruebas fallidas; NO continuar.' }
git diff --check
if ($LASTEXITCODE -ne 0) { throw 'Error en git diff --check.' }
git status --short
git diff --stat
# Solo bajo tu autorizacion y tras revisar resultados:
# git add -- $ARCHIVO $PRUEBA
# git commit -m "fix(logistica): filtrar altas PVO a etapas anteriores a produccion"
# NO incluye push, build ni despliegue.
```

**Estado:** FIX preparado y probado únicamente en entorno aislado; **sin commit ni push**, ninguna modificación de Aiven/Azure/Netlify ni del repositorio remoto.
