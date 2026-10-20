# BLT NOW | Instalaciones > Administracion | ALTAS FASE 5 V001

**Fecha:** 20/10/2026. **Estado:** paquete de QA y hardening preparado para instalacion **LOCAL**. **NO publicado, NO validado en Produccion.**
**Codigo oficial revisado:** `ziSirrush/GestorMantto`, rama `main`, commit `62eb487c56cdbeab40f8a7c859d081782287702c` (Version 102026.4, sin nuevos commits frente a Fase 4).
**Datos de referencia:** `FieldLine Instalaciones.xlsx`, Hoja1, fila 2 de ejemplo, fila 3 con formulas AG/AR/AS/BB/BJ/BU/CC; sabana estructural historica 07/10/2026. **Aiven actual no fue consultado**, por lo que no puede confirmarse que el esquema productivo actual coincida con el historico.

## 1. Que se entrega y por que

**Fase 5 - QA integral local y correcciones preventivas, sin introducir funcionalidad nueva ni cambios de BD.** Se conservan Fases 1-4 y se corrigen DOS riesgos de integridad identificados al revisar juntos sus contratos:

1. **Rutas antiguas de edicion:** el backend F4 protegia los calculados en el PATCH directo, pero la ficha/grupo/tabla y lote legacy admitian los calculados Excel (`meses_garantia_restantes`, `anio_termino`, `costo_mensual_mantenimiento_cem`) sobre altas humanas. Se agrega preflight solo si se intenta editar uno de esos campos; exige EDITAR + Guard CORELLIAN de la ruta, relee equipos bajo scope y verifica auditoria CREAR/POST. Se bloquea 409 **solo para equipos dados de alta en Administracion**, sin quitar la edicion historica permitida a registros GAS. Se protege tambien `id_proyecto` de equipos humanos, pues cambiar PP NS sin migrar la auditoria perderia su clasificacion de origen. Los otros campos manuales permanecen editables conforme a permisos.
2. **Cliente GAS desconectado:** el guard F4 podia liberar el candado MySQL al recibir evento `close` antes de que el controlador GAS confirmara su transaccion. Se mantiene el candado hasta que el controlador termine, aun ante cierre HTTP; la liberacion compartida es idempotente (finish/finally), conservando `INTEGRATION_INS_FL_ID` y el rechazo del lote completo (409) si incluye una alta humana.

**QA implementado:** nuevos tests backend y frontend, verificador estructural sin red, verificador opcional del Excel sin escribir y SQL de diagnostico **solo SELECT/SHOW**. La capa visual actual, el Guard general, Aiven, el sincronizador GAS y el modulo en Nevera NO se modifican en su comportamiento ordinario.

## 2. Archivos completos (solo nuevos o modificados)

| Accion | Ruta | Motivo |
|---|---|---|
| MOD | `backend/src/modules/instalaciones-administracion/instalaciones-administracion.routes.js` | Preflight anti-sobrescritura en 4 PATCH legacy, despues del Guard. |
| NUEVO | `backend/src/modules/instalaciones-administracion/instalaciones-administracion-altas-formula-guard.js` | Verificar alcance, procedencia, permiso y campos de formula/PPNS. |
| MOD | `backend/src/modules/instalaciones-administracion/instalaciones-administracion-altas-sync-guard.js` | No soltar candado por HTTP close prematuro. |
| MOD | `backend/src/routes/ins-fl.routes.js` | Wrapper async que libera candado cuando GAS termina realmente. |
| MOD | `backend/tests/instalaciones-administracion-altas-fase4.test.js` | Actualizar contrato de router GAS despues del ajuste. |
| NUEVO | `backend/tests/instalaciones-administracion-altas-fase5-integracion.test.js` | 18 pruebas integradas de permisos, alcance, auditoria, rutas y corte HTTP. |
| NUEVO | `tests/instalaciones-administracion-altas-fase5-frontend-formulas.test.js` | 20 pruebas de Ghost, captura multiple, formulas, fechas reales y borradores. |
| NUEVO | `validation/instalaciones-altas-fase5-excel-readonly.py` | Comparar Excel aportado, sus 7 formulas y 4 resultados de la fila 2. |
| NUEVO | `validation/instalaciones-altas-fase5-preflight.js` | Comprobar instalacion conjunta F1-F5 + loader/cache en checkout real (solo lectura). |
| NUEVO | `sql/20261020_INSTALACIONES_ALTAS_FASE5_DIAGNOSTICO_SOLO_LECTURA.sql` | Revision de columnas, UNIQUE, identidad y auditoria, sin escrituras. |

No se repiten Fases anteriores, no hay instaladores, `.patch`, ALTER, ni carpetas arbitrarias. El ZIP conserva rutas relativas.

## 3. Aplicacion LOCAL - PowerShell (sin publicar)

**Requisitos:** F1, F2, F3 y F4 **ya aplicadas en este mismo checkout** en el orden correcto, incluyendo el `core/module-loader.js` y `service-worker.js` descritos en sus respectivos README. Guardar antes el trabajo local. **No ejecutar sobre produccion.** Si algun hash no coincide, DETENER y conciliar; no sustituir otros cambios.

```powershell
$REPO = 'C:\Users\T14s\Downloads\mantto_gestor_frontend'
$ZIP = "$env:USERPROFILE\Downloads\BLTNOW_FASE5_ALTAS_INSTALACIONES_ADMIN_V001.zip"
Set-Location $REPO
if(-not (Test-Path -LiteralPath $ZIP)) { throw 'Falta ZIP F5.' }
git status --short

# Identidad exacta de los cuatro archivos QUE ESTA FASE MODIFICA.
$expected = @{
 'backend/src/modules/instalaciones-administracion/instalaciones-administracion.routes.js' = '9df10b20ddc8a715b7b8d59a09b76e3e5b64f7127fa34a9fc865d599304061ad'
 'backend/src/modules/instalaciones-administracion/instalaciones-administracion-altas-sync-guard.js' = 'd46b8bd3c4d5632fc01419fa93249acefa11fff1f8fdef112c8b7bad434530e2'
 'backend/src/routes/ins-fl.routes.js' = '8c0ff75f020ac4c70eb30b43be47ce29081f41e955ad8125194c98aef6aa9edc'
 'backend/tests/instalaciones-administracion-altas-fase4.test.js' = '0303dfdcff1326a5c96246e582c8ae7f561c0f08b10b3f827e9daaed1c709695'
}
foreach($p in $expected.Keys) {
 if(-not (Test-Path -LiteralPath $p)) { throw "Falta F1-F4: $p" }
 if((Get-FileHash -Algorithm SHA256 -LiteralPath $p).Hash.ToLowerInvariant() -ne $expected[$p]) {
   throw "Archivo diferente; DETENER y conciliar: $p"
 }
}
$new = @(
 'backend/src/modules/instalaciones-administracion/instalaciones-administracion-altas-formula-guard.js',
 'backend/tests/instalaciones-administracion-altas-fase5-integracion.test.js',
 'tests/instalaciones-administracion-altas-fase5-frontend-formulas.test.js',
 'validation/instalaciones-altas-fase5-excel-readonly.py',
 'validation/instalaciones-altas-fase5-preflight.js',
 'sql/20261020_INSTALACIONES_ALTAS_FASE5_DIAGNOSTICO_SOLO_LECTURA.sql'
)
foreach($p in $new) { if(Test-Path -LiteralPath $p){throw "Archivo F5 ya existe: $p"} }
if(-not (Test-Path 'backend/src/modules/instalaciones-administracion/instalaciones-administracion-altas-formulas.js')) {throw 'Fase 3 backend incompleta.'}
if(-not (Test-Path 'modules/instalaciones-administracion/instalaciones-administracion-altas-captura_cor.js')) {throw 'Fases 2-4 frontend incompletas.'}

# Copia local solamente de los cuatro archivos que se reemplazan.
$backup=Join-Path $env:TEMP ('BLTNOW_F5_backup_'+(Get-Date -Format yyyyMMdd_HHmmss))
foreach($p in $expected.Keys) {
 $dest=Join-Path $backup $p
 New-Item -ItemType Directory -Force -Path (Split-Path -Parent $dest) | Out-Null
 Copy-Item -LiteralPath $p -Destination $dest -ErrorAction Stop
}
Write-Host "Respaldo local F5: $backup"
Expand-Archive -LiteralPath $ZIP -DestinationPath $REPO -Force

# Todos los comandos de validacion siguientes son solo lectura.
node --check backend/src/modules/instalaciones-administracion/instalaciones-administracion.routes.js
if($LASTEXITCODE -ne 0) {throw 'Sintaxis F5 rutas fallida.'}
node --check backend/src/modules/instalaciones-administracion/instalaciones-administracion-altas-formula-guard.js
if($LASTEXITCODE -ne 0) {throw 'Sintaxis F5 guard fallida.'}
node --check backend/src/modules/instalaciones-administracion/instalaciones-administracion-altas-sync-guard.js
if($LASTEXITCODE -ne 0) {throw 'Sintaxis F5 sync fallida.'}
node --check backend/src/routes/ins-fl.routes.js
if($LASTEXITCODE -ne 0) {throw 'Sintaxis F5 GAS fallida.'}
node --test backend/tests/instalaciones-administracion-altas-fase1.test.js backend/tests/instalaciones-administracion-altas-fase4.test.js backend/tests/instalaciones-administracion-altas-fase5-integracion.test.js tests/instalaciones-administracion-altas-fase2.test.js tests/instalaciones-administracion-altas-fase3-formulas.test.js tests/instalaciones-administracion-altas-fase5-frontend-formulas.test.js
if($LASTEXITCODE -ne 0) {throw 'Regresion F1-F5 fallida. NO publicar.'}
node validation/instalaciones-altas-fase5-preflight.js
if($LASTEXITCODE -ne 0) {throw 'Preflight conjunto F1-F5 fallido. NO publicar.'}
git diff --check
if($LASTEXITCODE -ne 0) {throw 'Errores de whitespace. NO publicar.'}
git status --short
git diff --stat
```

**Excel original (opcional, SOLO LECTURA):**

```powershell
python validation/instalaciones-altas-fase5-excel-readonly.py "$env:USERPROFILE\Downloads\FieldLine Instalaciones.xlsx"
```

Este proceso NO ejecuta `git commit`, `git push`, migraciones, SQL, Azure, Pages ni Netlify. No se modifica `module-loader.js` ni `service-worker.js` porque F5 solamente agrega protecciones backend y pruebas: conserva versiones cache bust de F4.

## 4. QA realmente ejecutado para preparar el ZIP

- **119/119 pruebas locales Node PASS**: 81 de Fases 1-4 + 18 nuevas backend + 20 nuevas frontend. Son mocks/unidades; NO son E2E.
- **`node --check` PASS** en todos los JS preparados localmente.
- **Excel real adjunto verificado SOLO LECTURA:** Hoja1 tiene 89 columnas, 7 formulas en fila 3 y la fila 2 reproduce AG=24, AS=-6, BU=32, CC=2649 con un **corte hipotetico 2026-10-16**, sin afirmar que ese fuera el corte de Excel.
- **No realizado:** acceso a Aiven actual; pruebas reales GET/POST/Aiven/Azure, restauracion MySQL, carga GAS real, pruebas visuales PWA/Netlify, suite de todo el repositorio del usuario, despliegue ni verificacion efectiva de PowerShell en Windows. El verificador estructural requiere que las cinco fases esten colocadas en su checkout real; no se afirma que se haya ejecutado alli.

## 5. Checklist de E2E requerido ANTES de promover

Ejecutar **en entorno LOCAL de laboratorio con Aiven RESTAURADA y usuarios/permisos de prueba**. No generar altas deliberadas en produccion:

1. Respaldo reciente creado y **restaurado**, confirmar tabla `ins_fl`, UNIQUE `uq_ins_fl_proyecto_referencia`, estructura real y permisos desde Panel de Control. Ejecutar el SQL de diagnostico solo lectura en la restauracion.
2. Usuario con acceso visual + EDITAR + puerta CORELLIAN / INSTALACIONES: ve «+ Agregar nuevo». Usuario sin EDITAR, fuera del alcance, Visor y sesion expirada: NO crean registros ni revelan datos. Alcance `LIMITED`: cada fila queda dentro del alcance mediante responsables autorizados.
3. Crear 1 equipo con solo proyecto/PPNS/referencia; `NULL` en opcionales; crear 20 equipos de uno y de varios proyectos. Confirmar 20 IDs diferentes, cada uno 1 CREAR/POST en `usuario_interacciones`, sin fichas cruzadas. Intentar 21 y verificar 400 sin cambios.
4. Duplicados dentro del lote / contra BD / PPNS con dos nombres: 409 sin ningun INSERT. Forzar fallo de auditoria en restauracion: ROLLBACK de todo el lote; probar dos clientes concurrentes sobre mismo PPNS/referencia.
5. Verificar siete formulas F3 frente al archivo, `DD/MM/AAAA` en pantalla, dates ISO en SQL, porcentajes y costos. La vista previa de AR/BB NO debe convertirse en valor `*_real` persistido. Cambios diarios de equipos humanos respetan `DIAS360`/`DIAS.LAB`; GAS historico mantiene su regla anterior.
6. Probar PATCH directo y las 4 rutas legacy: para alta humana bloquear formulas derivadas/PPNS (409), permitir otros cambios manuales autorizados. Para equipo GAS historico conservar comportamiento legacy. Reconsultar con GET autorizado tras POST y verificar respuesta 403 si cambio el alcance.
7. Enviar bloque GAS con una identidad de alta humana: 409 **para TODO el bloque**; cero operaciones. Reenviar bloque depurado por procedimiento autorizado y comprobar conteos insertados/actualizados. Interrumpir HTTP durante procesamiento GAS en laboratorio y comprobar que el candado no se libera antes del COMMIT/ROLLBACK.
8. Revisar otras pantallas de Instalaciones, Dashboard, proyectos, fotografia, fecha diaria, PWA, caché, carga de ambas formulas, auditoria y notificaciones. Confirmar Local -> GitHub Pages -> Netlify manualmente SOLO con autorizacion expresa.

**BLOQUEO DE PUBLICACION:** falta este E2E real y confirmar el comportamiento operativo de GAS 409 para que el equipo que opera la integracion pueda conciliar/reprocesar los bloques. **No puedo confirmar esto** sobre Azure ni Aiven actual con el ZIP aislado.

## 6. Reversion y sistemas afectados

Revertir exclusivamente los 4 archivos respaldados por el PowerShell, siempre revisando si hubo modificaciones posteriores; retirar solamente los 6 archivos nuevos F5 si no tienen cambios ajenos. No usar `git reset --hard` ni restaurar una BD que no fue modificada.

**Modificado realmente:** archivos preparados bajo `/mnt/data` (ZIP y evidencias QA), exclusivamente. **Sin modificar:** GitHub, Aiven, Azure, Netlify, GitHub Pages y cualquier sistema externo. No hay despliegue, commit ni push.
