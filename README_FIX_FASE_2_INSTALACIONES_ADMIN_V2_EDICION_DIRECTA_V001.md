# Mantto Gestor — FIX Fase 2/4 · Instalaciones → Administración V2

**FIX:** `FIX_FASE_2_INSTALACIONES_ADMIN_V2_EDICION_DIRECTA_V001`  
**Fecha:** 13/10/2026  
**Base consultada:** GitHub `ziSirrush/GestorMantto`, rama `main`, commit `3a7b66e83e880d32d511649d555f19935596bb60` (Version 101326.4).  
**Dependencia OBLIGATORIA:** la Fase 1 `FIX_FASE_1_INSTALACIONES_ADMIN_V2_BACKEND_V001` debe estar integrada en el backend **y desplegada en Azure** antes de usar la nueva interfaz en línea. Este ZIP NO incluye Fase 1.

## 1. Objetivo y alcance

La Fase 2 sustituye el editor fantasma con borradores y guardado explícito por **edición individual directa con autoguardado** en la **pantalla secundaria** de Instalaciones → Administración:

- Una fila por equipo y desplazamiento horizontal; conserva el paginado existente.
- Se eliminan las acciones visibles **Guardar cambios**, **Aplicar borrador** y **Descartar cambios**. No hay borradores persistentes.
- Los textos se guardan al presionar Enter (excepto textarea) o al salir de la celda. Listas y calendarios se guardan al seleccionar/cambiar. **Nunca se envía un PATCH por cada tecla.** Escape cancela mientras no se haya enviado el cambio.
- El editor usa `window.ManttoAuth.api`, el mismo cliente autenticado utilizado por el módulo. La escritura va solo a `PATCH .../edicion-directa` de Fase 1, con **una columna** y su valor original en `expected`.
- Tras un PATCH aceptado, se relee por **GET protegido** el equipo; se verifica el valor y se recarga la tabla para actualizar `estatus_completo`, `dias_sin_visita`, `dias_sin_ccnr`, `dias_restantes` y `rel_admin`.
- Si hay error de red, conflicto de concurrencia o respuesta ambigua, **no hay reintento automático**; la edición se bloquea hasta actualizar/revisar. Si cambia el permiso/alcance, se limpian los datos de la tabla para no retener información fuera del alcance.
- Las columnas de IDs/control **se ocultan**: `id_ins_fl`, `id_proyecto`, `id_sup`, `id_asesor`, `id_admin`, `activo`, `created_at`, `updated_at`. Los ID internos siguen presentes como llaves de operación, sin mostrarse como encabezados.
- Los cuatro valores calculados **permanecen visibles pero de solo lectura**. `rel_admin` (virtual) también es visible y de solo lectura cuando ambos grupos autorizados están disponibles; muestra iniciales separadas por coma según Fase 1.
- Campos list: `estatus` (ocho códigos), `vendedor` (iniciales activas de Ventas), `supervisor_fl` (iniciales activas de Instalaciones). Se usan catálogos del backend; si no se pueden consultar o hay iniciales duplicadas, se bloquea esa selección sin inventar opciones. Las FK relacionadas se actualizan **únicamente en backend Fase 1**, nunca mediante un segundo PATCH de la interfaz.
- Fechas: tipo `date` según metadatos del contrato V2, incluido `recepcion_carpeta`; `fecha_liberacion_ajuste` **permanece como texto** (admite `SI` o fecha escrita). Porcentajes/montos conservan validación.
- Los campos ocultos y calculados están protegidos también en backend Fase 1. No basta con ocultarlos en el DOM.

**Fase 3, NO incluida aquí:** checkboxes al inicio, contador, botón «Deseleccionar todo» exactamente en el área antes ocupada por «Descartar cambios», confirmación y lote transaccional. Fase 2 no implementa aún edición múltiple. Fase 4: integración y QA E2E/regresiones.

## 2. Contenido del ZIP (archivos completos, rutas reales)

| Archivo | Tipo | Alcance |
| --- | --- | --- |
| `modules/instalaciones-administracion/instalaciones-administracion-ghost_cor.js` | Completo modificado | Editor directo, validación, PATCH+GET, render sin IDs, listas y fechas. |
| `modules/instalaciones-administracion/instalaciones-administracion-ghost_cor.css` | Completo modificado | Estilos **solo de la vista secundaria**, estado Guardando/Guardado/Error. |
| `tests/instalaciones-administracion-v2-edicion-directa.test.js` | Nuevo | 37 casos unitarios/simulados sobre los JS/CSS reales empaquetados. |
| `README_FIX_FASE_2_INSTALACIONES_ADMIN_V2_EDICION_DIRECTA_V001.md` | Documentación | Este documento. |

No incluye instalador, `.patch`, base de datos, SQL, ejecutables, dependencias del frontend, copias del proyecto ni archivos de otras áreas. No sustituye `instalaciones-administracion_cor.js`, HTML, Main, router, permisos centrales, assets de otros módulos, ni notificaciones.

## 3. Preflight OBLIGATORIO (Windows / PowerShell)

1. Respalda tus cambios locales. No usar `git reset --hard`, `git clean -fd` ni sobrescribir modificaciones propias sin revisarlas.
2. Comprueba que la Fase 1 existe en el checkout local y que el backend **ya desplegado** tiene `GET /api/instalaciones/administracion/catalogos-edicion` y `PATCH .../edicion-directa`. Si obtienes 404, Fase 1 no está desplegada: **no activar Fase 2**.
3. Los archivos Ghost actuales deben ser exactamente los de `main` verificado antes de la Fase 2:

| Archivo | Git blob SHA requerido, contenido local |
| --- | --- |
| `modules/instalaciones-administracion/instalaciones-administracion-ghost_cor.js` | `ee7653674a80f74124c75c0ecb879986ea41ebb2` |
| `modules/instalaciones-administracion/instalaciones-administracion-ghost_cor.css` | `94478d6e1ab6b7609eec9561efd513b72223c3d5` |

Comprobación no destructiva: desde la raíz, usa `git hash-object -- modules/instalaciones-administracion/instalaciones-administracion-ghost_cor.js` y el equivalente para CSS. **Si no coincide, DETENER y conciliar**: el cambio puede venir de un FIX previo o trabajo local, y este paquete no debe sobrescribirlo sin revisión.

### Aplicación DIRECTA sin scripts de instalación

Una vez verificados Fase 1, los hashes y el contenido del ZIP:

```powershell
$REPO = 'C:\Users\T14s\Downloads\mantto_gestor_frontend'
$ZIP = "$env:USERPROFILE\Downloads\FIX_FASE_2_INSTALACIONES_ADMIN_V2_EDICION_DIRECTA_V001.zip"
Set-Location $REPO

if (-not (Test-Path '.\backend\src\modules\instalaciones-administracion\instalaciones-administracion.auto-service.js')) {
    throw 'Falta Fase 1 del backend en este repositorio.'
}
$Ghost = 'modules/instalaciones-administracion/instalaciones-administracion-ghost_cor.js'
$Css = 'modules/instalaciones-administracion/instalaciones-administracion-ghost_cor.css'
$HashGhost = (git hash-object -- $Ghost).Trim()
$HashCss = (git hash-object -- $Css).Trim()
if ($HashGhost -ne 'ee7653674a80f74124c75c0ecb879986ea41ebb2' -or
    $HashCss -ne '94478d6e1ab6b7609eec9561efd513b72223c3d5') {
    throw 'Archivos base diferentes. No sobrescribir sin conciliacion.'
}

Expand-Archive -LiteralPath $ZIP -DestinationPath $REPO -Force
node --check '.\modules\instalaciones-administracion\instalaciones-administracion-ghost_cor.js'
if ($LASTEXITCODE -ne 0) { throw 'Error de sintaxis Fase 2.' }
node --test '.\tests\instalaciones-administracion-v2-edicion-directa.test.js'
if ($LASTEXITCODE -ne 0) { throw 'Error de pruebas Fase 2.' }
git diff --check
if ($LASTEXITCODE -ne 0) { throw 'Error git diff --check.' }
git status --short
git diff --stat
```

**Resultado esperado de `git status --short`:** los dos archivos Ghost modificados (`M`) y un archivo de pruebas nuevo (`??`), además de cualquier cambio anterior propio en el checkout. Si no aparecen, **el FIX no se ha aplicado**. No hacer commit a ciegas.

**Nota de caché/PWA:** la Fase 2 reutiliza las rutas ya registradas en `core/module-loader.js` y no modifica `index.html` para respetar el alcance mínimo. El navegador puede conservar la antigua versión en caché. Al probar en GitHub Pages, realiza recarga completa y actualiza/elimina la caché de la PWA de pruebas si sigue mostrando borradores. **No se considera desplegado ni validado online** hasta comprobar la interfaz efectivamente cargada. La revisión integral de versión/cache-busting pertenece a Fase 4.

## 4. Validación manual requerida ANTES de liberar

- Con usuario autorizado y ambos permisos `...ACCESO_VISUAL` y `...EDITAR`, abrir un proyecto con equipos en tu alcance.
- Confirmar **que no aparecen columnas ID**, ni `activo`, `created_at`, `updated_at`; sí aparecen los cuatro calculados.
- Editar texto, pulsar Enter / salir; verificar un solo PATCH y GET; recargar y comparar con `ins_fl`/Aiven.
- Modificar un estatus de prueba; verificar `estatus_completo` derivado, sin mandar un segundo cambio manual.
- Seleccionar vendedor y supervisor; verificar iniciales y FK vinculadas usando consulta de administrador de solo lectura, sin exponer IDs en la UI.
- Comprobar `rel_admin` con 1 o más administradores en `usuarios_rel_admin`, concatenados por coma.
- Comprobar campo `fecha_liberacion_ajuste` como texto, `recepcion_carpeta` como calendario, fechas inválidas, porcentajes y límites de texto.
- Usuario solo visual / Visor: no debe poder escribir. Usuario fuera de scope: PATCH debe fallar.
- Conflicto `409` y timeout: no sobreescribir datos de otra sesión y no reintentar automáticamente.
- Simular pérdida de permiso/alcance después de un PATCH: la UI no debe mostrar información revocada.
- Comprobar inserción atómica de `usuario_interacciones` y que falla auditoría implica ROLLBACK (backend Fase 1).
- La página Main, el Dashboard, otros módulos y notificaciones no deben cambiar.

## 5. Resultado de pruebas ejecutadas y limitaciones

- `node --check` en JavaScript completo de Fase 2: **PASS**.
- `node --test tests/instalaciones-administracion-v2-edicion-directa.test.js`: **37/37 PASS** (helpers, validaciones, render, flujo simulado de click > blur > PATCH > GET, select vendedor, concurrencia y alcance simulado).
- Pruebas aisladas previas del backend Fase 1, usando sus archivos entregados: **37/37 PASS**. Estas NO prueban el despliegue real.
- SHA Git blob del Ghost JS/CSS de origen contrastados contra `main` en GitHub.
- **NO realizado:** instalación en la PC del usuario, ejecución del proyecto completo con navegador real, Aiven/Azure, pruebas integrales/E2E, validación real del flujo de carga de la PWA, ni despliegue GitHub Pages o Netlify.

La Fase 1 tiene un job diario de recalculados que puede modificar numerosas filas históricas. El presente FIX **no** crea ni ejecuta ese job. Antes de desplegar Fase 1 debes revisar sus advertencias de respaldo y prueba con BD restaurada.

## 6. Reversión

Si aún no existe commit, guarda cualquier trabajo adicional y restaura **solo los dos archivos Ghost** desde la versión anterior verificada. Borra el test nuevo únicamente si no se necesita. No reviertas todo el repositorio, ni borres cambios de otros módulos. La reversión del frontend **no revierte actualizaciones** que ya haya hecho el backend/Aiven durante pruebas reales.

**Estado de sistemas en esta entrega:** solo se generó un ZIP local. GitHub, Azure, Aiven, GitHub Pages y Netlify permanecen sin modificaciones por esta Fase 2.
