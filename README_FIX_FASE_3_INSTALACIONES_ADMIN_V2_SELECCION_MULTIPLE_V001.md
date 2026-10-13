# Mantto Gestor — FIX Fase 3/4 · Instalaciones → Administración V2

**Entregable:** `FIX_FASE_3_INSTALACIONES_ADMIN_V2_SELECCION_MULTIPLE_V001`  
**Fecha:** 13/10/2026  
**Origen versionado verificado:** GitHub `ziSirrush/GestorMantto`, `main` commit `3a7b66e83e880d32d511649d555f19935596bb60` (`Version 101326.4`).  
**Base del cambio:** los DOS archivos completos del FIX **Fase 2 V001** entregado anteriormente. La Fase 2 **no se presupone integrada en `main`**; este ZIP se debe aplicar después de Fase 2, **no sobre los archivos Ghost de `main` sin conciliar**.

## 1. Alcance funcional

Implementa en la **tabla secundaria** de Instalaciones → Administración la selección múltiple y el guardado de **una misma columna en 2 a 20 equipos de un mismo PP NS**.

1. **Checkbox como primera columna de cada equipo**, fija a la izquierda al desplazarse horizontalmente. Se permite marcar equipos de diferentes páginas **dentro del mismo proyecto**; nunca combinar proyectos. La selección no se almacena en base de datos ni en almacenamiento del navegador.
2. **Contador de selección** en la barra de herramientas: `N de TOTAL equipos seleccionados`. Al llegar a 20, las casillas de otros equipos quedan deshabilitadas. En vistas solo lectura, Visor o proyectos sin PP NS (`R:`), las casillas no permiten seleccionar.
3. **Botón «Deseleccionar todo» permanente**, **exactamente en la zona derecha de la barra donde estaba «Descartar cambios»**. Está **fuera del desplazamiento horizontal de la matriz** y su barra es sticky al desplazar verticalmente. Está visible incluso con cero seleccionados. Al pulsarlo borra la selección **sin escribir en Aiven** y cancela cualquier valor de celda aún no enviado. **Durante una transacción de guardado queda temporalmente deshabilitado**: no cancela ni revierte cambios ya confirmados.
4. **Sin pantallas de lote ni borradores**: con 2–20 equipos seleccionados, se edita una celda de **una fila marcada**; el valor se aplica a la **misma columna en todos los equipos seleccionados**. Las filas no marcadas no pueden editarse mientras esté activo ese lote. Si los valores originales difieren, el editor se presenta vacío y lo indica.
5. **Confirmación obligatoria antes del PATCH**: campo, nuevo valor y cantidad de equipos. **Cancelar = cero PATCH**. Textos: Enter o salir de la celda; listas y calendarios: al cambiar. Escape cancela. **Con cero o un checkbox marcado sigue la edición individual de Fase 2, sin confirmación múltiple**.
6. **Un único PATCH transaccional de Fase 1**, `PATCH /api/instalaciones/administracion/proyectos/:projectKey/equipos/edicion-multiple-directa`, con `ids`, `changes` de **una columna** y `expected` **por equipo**. El backend de Fase 1 sigue siendo la autoridad de permisos, puerta CORELLIAN, scope, pertenencia, concurrencia, validación, cálculos, FK y auditoría. El lote es **todos o ninguno**, con UPDATE + interacciones en una transacción.
7. Tras aceptación, **GET autorizado por cada equipo** (máximo 4 solicitudes simultáneas) y **refresco selectivo inmediato de la página** para reflejar derivados (`estatus_completo`, `dias_sin_visita`, `dias_sin_ccnr`, `dias_restantes`) y `rel_admin` virtual. Si hay conflicto `409`, acceso revocado, timeout o relectura ambigua **no hay reintento automático**; se pide **Actualizar**. Si se revoca el alcance se limpia la información de la tabla.

**Sin modificaciones:** `Main`, dashboard, servidor Express, rutas, Guards, tablas Aiven, columnas, motor de auditoría, notificaciones, `index.html`, `core/module-loader.js` ni otros módulos. Los campos IDs/controles y los calculados conservan la política ya establecida en Fases 1 y 2. `fecha_liberacion_ajuste` permanece como texto.

## 2. Archivos del ZIP — archivos COMPLETOS y rutas originales

| Ruta | Tipo | Motivo |
| --- | --- | --- |
| `modules/instalaciones-administracion/instalaciones-administracion-ghost_cor.js` | Modificado completo | Checkboxes, selección entre páginas, editor múltiple, confirmación, transacción F1, GET seguro, limpieza. |
| `modules/instalaciones-administracion/instalaciones-administracion-ghost_cor.css` | Modificado completo | Botón fijo en barra (sticky), primera columna fija, contador, filas marcadas, responsive. |
| `tests/instalaciones-administracion-v2-seleccion-multiple.test.js` | Nuevo | 45 pruebas simuladas con código real de ambos archivos. |
| `README_FIX_FASE_3_INSTALACIONES_ADMIN_V2_SELECCION_MULTIPLE_V001.md` | Documentación | Este documento. |

Sin instaladores, `.patch`, duplicados de proyecto, dependencias nuevas, SQL ni archivos ajenos a esta fase.

## 3. Dependencias y preflight obligatorio

- **Fase 1 V001** instalada en el checkout local y desplegada en Azure. Su ruta `PATCH .../edicion-multiple-directa` debe responder a sesiones autorizadas. **No puedo confirmar** desde este entregable que Azure tenga esa fase desplegada.
- **Fase 2 V001** aplicada en el mismo checkout local. Los dos archivos Ghost actuales deben coincidir exactamente con el contenido del ZIP Fase 2:

| Archivo local | SHA `git hash-object` de Fase 2 requerido |
| --- | --- |
| `modules/instalaciones-administracion/instalaciones-administracion-ghost_cor.js` | `184d3bc2c76e1ea74c1058d4d8ad60d1eaaf4150` |
| `modules/instalaciones-administracion/instalaciones-administracion-ghost_cor.css` | `b5fd25bd8e32b8fdaca5494995be4e1dd8831937` |

**Si alguno de esos hashes no coincide, DETENER y conciliar los cambios propios, sin sobrescribir archivos ni hacer hard reset.** La Fase 3 no se ha diseñado para reemplazar a ciegas un editor Ghost distinto.

### Aplicación manual (sin scripts de instalación)

Descarga el ZIP y colócalo en `Downloads`. Antes de extraer, desde PowerShell:

```powershell
$REPO = 'C:\Users\T14s\Downloads\mantto_gestor_frontend'
$ZIP = "$env:USERPROFILE\Downloads\FIX_FASE_3_INSTALACIONES_ADMIN_V2_SELECCION_MULTIPLE_V001.zip"
Set-Location $REPO

git status --short
if (-not (Test-Path '.\backend\src\modules\instalaciones-administracion\instalaciones-administracion.auto-service.js')) {
    throw 'Falta Fase 1 del backend. Detener.'
}
if (-not (Test-Path $ZIP)) { throw 'No se encontro el ZIP de Fase 3.' }
$Ghost = 'modules/instalaciones-administracion/instalaciones-administracion-ghost_cor.js'
$Css = 'modules/instalaciones-administracion/instalaciones-administracion-ghost_cor.css'
if (-not (Test-Path $Ghost) -or -not (Test-Path $Css)) {
    throw 'Faltan archivos de Fase 2. Detener.'
}
$HashGhost = (git hash-object -- $Ghost).Trim()
$HashCss = (git hash-object -- $Css).Trim()
if ($HashGhost -ne '184d3bc2c76e1ea74c1058d4d8ad60d1eaaf4150' -or
    $HashCss -ne 'b5fd25bd8e32b8fdaca5494995be4e1dd8831937') {
    throw 'Fase 2 distinta a la base aprobada. Conciliar antes de instalar.'
}

# Solo tras el preflight y un respaldo de tus dos archivos Ghost:
Expand-Archive -LiteralPath $ZIP -DestinationPath $REPO -Force
node --check '.\modules\instalaciones-administracion\instalaciones-administracion-ghost_cor.js'
if ($LASTEXITCODE -ne 0) { throw 'Error de sintaxis JS.' }
node --test '.\tests\instalaciones-administracion-v2-seleccion-multiple.test.js'
if ($LASTEXITCODE -ne 0) { throw 'QA Fase 3 fallida.' }
git diff --check
if ($LASTEXITCODE -ne 0) { throw 'Error git diff --check.' }
git status --short
git diff --stat
```

**Ningún comando hace commit, push, deploy, ALTER, UPDATE SQL o limpieza destructiva.** `Expand-Archive -Force` solo se debe ejecutar **después** de pasar el control de hashes y resguardar el trabajo local.

**Rollback de código:** volver a colocar **únicamente** los dos archivos Ghost del ZIP Fase 2 V001 y retirar `tests/instalaciones-administracion-v2-seleccion-multiple.test.js` si no tiene cambios propios. **No** restaurar desde HEAD a ciegas: HEAD podría tener todavía la Fase 2 sin integrar. Un rollback de archivos no revierte datos ya escritos por operaciones autorizadas en Aiven.

## 4. Pruebas antes de integrar o desplegar

- En entorno **Local**, y luego en **GitHub Pages de validación**, abrir un proyecto con al menos tres equipos y un usuario autorizado.
- Marcar 2 filas; verificar casillas a la izquierda, botón siempre visible a la derecha fuera del scroll, contador y edición exclusiva en filas marcadas.
- Cambiar texto en una celda; confirmar **una sola** solicitud PATCH de lote con los `expected` correctos, GET de los equipos afectados y actualización de valores relacionados. Comprobar auditoría en el servicio existente sin exponer datos sensibles.
- Cancelar una edición y confirmar que **no se envió PATCH**. Probar Escape y «Deseleccionar todo» mientras hay texto sin enviar.
- Seleccionar 20 y verificar que la fila 21 no sea seleccionable; comprobar que cambiar de página **dentro del mismo proyecto** conserva los seleccionados. Cambiar de proyecto o actor los limpia.
- Comprobar conflicto `409`, timeout y pérdida de permiso/scope con un usuario de pruebas: sin segundo PATCH automático, sin mostrar filas fuera de alcance.
- Confirmar que un checkbox solo usa autoguardado individual sin confirmación múltiple y que listas, fechas y calculados mantienen la Fase 2.
- Para pruebas de escritura, usar **equipos de laboratorio y respaldo validado**. No ensayar cambios destructivos en Aiven productivo.

**Caché/PWA:** se reutilizan rutas JS/CSS existentes; el módulo cargador no se modifica en esta fase. Si se ve la interfaz anterior, hacer recarga completa, verificar desde DevTools el JS realmente servido y actualizar caché de la PWA de pruebas. **La actualización global del versionado/caché se revisará en Fase 4**, y no debe asumirse que Netlify despliega automáticamente desde GitHub.

## 5. Validaciones realmente ejecutadas en la preparación

- `node --check` del JS y de la prueba nueva: **correcto**.
- `node --test`: **45/45** pruebas simuladas nuevas de Fase 3 **correctas** (payload, confirmación, cancelación, límite, paginado, visibilidad, API falsa, relectura, concurrencia y fallos).
- Regresión con el test de Fase 2 contra el JS de Fase 3: **37/37** pruebas simuladas correctas; **82/82** en ejecución conjunta.
- `git diff --no-index --check`: sin errores de whitespace introducidos (se espera `exit 1` cuando los archivos comparados son diferentes, aunque no haya errores).
- **No realizado:** pruebas E2E con navegador real, integración con Azure/Aiven, validación de auditoría en base real, despliegue ni promoción de ambiente. **No puedo confirmar el estado desplegado de Fases 1 o 2** solo por haber creado estos ZIP.

**Estado de sistemas:** entrega de archivos solamente; **GitHub, Azure, Aiven, GitHub Pages y Netlify permanecen intactos**.
