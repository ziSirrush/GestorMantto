# Mantto Gestor — Instalaciones → Administración V2 — FIX Fase 4/4 · Integración y QA V001

**Fecha:** 13/10/2026.  
**Fuente oficial consultada:** GitHub `ziSirrush/GestorMantto`, rama `main`, commit `3a7b66e83e880d32d511649d555f19935596bb60` (*Version 101326.4*).  
**Dependencias explícitas:** ZIP de Fase 1 (`FIX_FASE_1_INSTALACIONES_ADMIN_V2_BACKEND_V001.zip`), Fase 2 (`FIX_FASE_2_INSTALACIONES_ADMIN_V2_EDICION_DIRECTA_V001.zip`) y Fase 3 (`FIX_FASE_3_INSTALACIONES_ADMIN_V2_SELECCION_MULTIPLE_V001.zip`), **en ese orden**. **Ninguna de esas fases se presupone integrada en `main` ni desplegada en Azure/Netlify.**

## 1. Motivo y alcance

Durante la integración de las tres fases se detectó una **consulta global sin filtro CORELLIAN** en `getEditCatalogs_cor`: el endpoint de captura entregaba `rel_admin_por_asesor` para **todos** los asesores en `usuarios_rel_admin`. El editor V2 **no necesita** ese mapa. Esto exponía información de relaciones ajenas al alcance, aunque el usuario tuviera permiso para editar sus propios equipos.

**Corrección:** quitar la consulta global `GROUP_CONCAT` y la propiedad `rel_admin_por_asesor` de la respuesta de `GET /api/instalaciones/administracion/catalogos-edicion`. Se preservan los catálogos de ocho estatus, vendedores activos de Ventas y supervisores activos de Instalaciones. La columna visible **`rel_admin` continúa funcionando con iniciales separadas por coma**, pero se calcula desde el **endpoint de la tabla del proyecto**, que vuelve a aplicar permiso, llave del proyecto y scope CORELLIAN a cada equipo antes de consultar las relaciones.

**No cambia:** autoguardado individual, selección múltiple de 2 a 20, casillas, «Deseleccionar todo» en barra fija, confirmación previa, transacción todos-o-ninguno, auditoría, campos calculados, `fecha_liberacion_ajuste` como texto, Main, permisos centrales, esquema SQL o configuración global. No instala tablas, dependencias ni tareas nuevas.

## 2. Contenido del ZIP — solo archivos completos

| Ruta relativa al repositorio | Clase | Motivo |
| --- | --- | --- |
| `backend/src/modules/instalaciones-administracion/instalaciones-administracion.auto-service.js` | **Modificado**, versión completa | Evitar divulgación de relaciones globales en el catálogo de edición. |
| `backend/tests/instalaciones-administracion-auto-v2.test.js` | **Modificado**, versión completa | Adaptar fixture y regresión de Fase 1: prohibir la consulta global. |
| `tests/instalaciones-admin-v2-fase4-integracion.test.js` | **Nuevo** | Contratos frontend/backend, permisos, auditoría y concurrencia simulados. |
| `README_FIX_FASE_4_INSTALACIONES_ADMIN_V2_INTEGRACION_QA_V001.md` | Documento | Diagnóstico, instalación, pruebas, bloqueos y reversión. |

Este paquete **NO** contiene las Fases 1–3 repetidas ni los recursos Ghost intactos. Tampoco contiene instaladores, scripts para ejecutar el FIX, parches `.patch`, copias de base de datos, archivos del Dashboard o de Main.

## 3. Preflight: comprobar dependencias ANTES de sobrescribir

Trabajar desde la **raíz del repositorio local** (con la carpeta `.git`). Si cualquiera de los hashes es distinto, **DETENER y conciliar**, no forzar una sobreescritura de trabajo local. Los dos primeros hashes representan Fase 1 V001 **antes** de Fase 4; los otros dos representan Fase 3 V001 y sirven para verificar que la integración toma el frontend aprobado.

| Archivo local | SHA blob esperado (`git hash-object`) |
| --- | --- |
| `backend/src/modules/instalaciones-administracion/instalaciones-administracion.auto-service.js` | `a83681a6d9394830077ee92ef48af7dab2ee7217` |
| `backend/tests/instalaciones-administracion-auto-v2.test.js` | `a6431c75a446e0d60246489d9c0e785a9047bb48` |
| `modules/instalaciones-administracion/instalaciones-administracion-ghost_cor.js` | `b82850e7fd5bcc5ef87b95c86112f20193503297` |
| `modules/instalaciones-administracion/instalaciones-administracion-ghost_cor.css` | `c581a52dd9ec40004d3641cce33f10dde06e4c7f` |

Ejemplo, en PowerShell dentro del repositorio:

```powershell
# Solo comprobar. No realiza escrituras.
git status --short
git hash-object -- backend/src/modules/instalaciones-administracion/instalaciones-administracion.auto-service.js
git hash-object -- backend/tests/instalaciones-administracion-auto-v2.test.js
git hash-object -- modules/instalaciones-administracion/instalaciones-administracion-ghost_cor.js
git hash-object -- modules/instalaciones-administracion/instalaciones-administracion-ghost_cor.css
```

**Instalación manual** únicamente si coinciden todos los hashes: guardar copia de los dos archivos a sustituir; revisar con `tar -tf` el ZIP; luego, desde la raíz del proyecto, extraerlo conservando rutas relativas:

```powershell
$ZIP="$env:USERPROFILE\Downloads\FIX_FASE_4_INSTALACIONES_ADMIN_V2_INTEGRACION_QA_V001.zip"
if (-not (Test-Path -LiteralPath $ZIP)) { throw 'ZIP no encontrado.' }
# Ejecutar solo tras comparar los cuatro hashes y realizar las copias de seguridad.
Expand-Archive -LiteralPath $ZIP -DestinationPath (Get-Location).Path -Force
```

**Importante:** aplicar el ZIP no despliega Azure, GitHub Pages ni Netlify. El backend de Fase 1 debe estar realmente desplegado para probar los endpoints; este ZIP sustituye un solo archivo del backend F1. El frontend F2/F3 debe estar servido en la versión esperada para pruebas manuales.

## 4. QA realizado en esta entrega

Las pruebas se ejecutaron sobre una **composición local** de los ZIP Fases 1, 2 y 3, sobrescribiendo con los tres archivos JS finales de Fase 4. El repositorio remoto NO fue modificado.

```powershell
node --check .\backend\src\modules\instalaciones-administracion\instalaciones-administracion.auto-service.js
node --check .\backend\tests\instalaciones-administracion-auto-v2.test.js
node --check .\tests\instalaciones-admin-v2-fase4-integracion.test.js
node --test `
  .\backend\tests\instalaciones-administracion-auto-v2.test.js `
  .\tests\instalaciones-administracion-v2-edicion-directa.test.js `
  .\tests\instalaciones-administracion-v2-seleccion-multiple.test.js `
  .\tests\instalaciones-admin-v2-fase4-integracion.test.js
```

| Componente | Resultado local |
| --- | --- |
| QA backend Fase 1 (ajustado para catálogo seguro) | **37/37 PASS** |
| Regresión de edición individual Fase 2 | **37/37 PASS** |
| Regresión de edición múltiple Fase 3 | **45/45 PASS** |
| Pruebas nuevas de integración Fase 4 | **13/13 PASS** |
| **Total** | **132/132 PASS — simulaciones con mocks**, no MySQL real |
| `node --check` de los archivos JS nuevos/modificados | **PASS** |

Las pruebas de integración ejercitan helpers de Fase 3 y el servicio real de Fase 1 **con BD, scope y auditoría simulados**. Cubren contratos de campos visibles y calculados, ocho estatus, fechas y campo `fecha_liberacion_ajuste`, catálogo privado, PATCH individual/lote, relectura GET, concurrencia 409, revocación de permisos, rollback por fallo de auditoría, FK y múltiples administrativos. **No equivalen a una prueba end-to-end ni demuestran que un despliegue real funcione.**

Se intentó probar con navegador automatizado, pero el entorno de prueba bloqueó acceso a `127.0.0.1` y `file://` (`ERR_BLOCKED_BY_ADMINISTRATOR`); por tanto **NO se presenta como QA E2E aprobado**.

## 5. Validaciones pendientes y advertencias antes de Producción

1. **Restauración y backup Aiven:** la Fase 1 agrega un job que puede actualizar numerosas filas históricas de `ins_fl` al iniciar. Antes del primer deploy sobre la BD, hacer respaldo verificado y validar restauración en laboratorio. Revertir el código no revierte esos datos.
2. **Sincronización GAS / `/sync`:** el controlador legado `backend/src/controllers/ins-fl.controller.js` incluye derivados en su lista de campos sincronizables; una sincronización posterior al job nocturno puede volver a escribir `dias_sin_visita`, `dias_sin_ccnr`, `dias_restantes` o `estatus_completo`. **No puedo confirmar que no ocurra en la operación real.** Comprobar orden de sincronización y reconciliación de derivados antes de cerrar aprobación de Producción. Este FIX no modifica la ruta de sincronización ni el módulo ajeno.
3. **Dashboard y `fecha_liberacion_ajuste`:** la tabla V2 permite el texto `SI` o una fecha, como se acordó. El Dashboard existente evalúa `SI` como liberación; verificar en datos reales si la fecha también debe contar como liberado. **No se cambió Dashboard** (fuera del alcance aprobado).
4. **Caché/PWA:** `core/module-loader.js` y `index.html` todavía contienen parámetros `?v=` previos a las Fases 2 y 3. Las fases reutilizaron nombres de archivo; verificar **en red/DevTools** que efectivamente se carga el JS/CSS Ghost de Fase 3 y no contenido cacheado. Para prueba Local/GitHub Pages, recargar sin caché o limpiar caché de la PWA de **pruebas**. No se actualizó globalmente el loader para evitar sobrescribir un archivo central fuera del módulo sin integrarlo desde el `main` actual. **No declarar validado online si muestra la interfaz anterior.**
5. **Seguridad real:** verificar Guard y scope de lectura/edición CORELLIAN, Visor solo lectura, 20 equipos máximos, selección entre páginas, cancelación con cero escrituras, conflicto 409, rollback ante auditoría fallida, relectura después de cambio de responsables, error de red sin reintentos, botones y foco teclado, y auditoría de `usuario_interacciones` en base de laboratorio.
6. **Promoción autorizada:** validar primero Local → GitHub Pages. Netlify es **frontend de producción de despliegue manual**. Azure es el backend autorizado. No publicar en Producción sin validar los puntos anteriores y autorizar el despliegue.

**Estado honesto de la Fase 4:** el ZIP está terminado, su prueba de integración simulada pasa y corrige el problema de catálogo sin alcance. **La integración real Azure/Aiven, el comportamiento de `/sync`, la compatibilidad de Dashboard con fechas y la invalidación de caché requieren validación antes de considerar liberada la V2 en Producción.**

## 6. Reversión y sistemas intactos

Para revertir **esta Fase 4**, restaurar la copia de `instalaciones-administracion.auto-service.js` y el test de backend de Fase 1 V001; retirar el test nuevo de Fase 4 solo si no hay cambios propios. No revertir los archivos Ghost de Fases 2/3. Esto **reabre** la divulgación del catálogo original: en ambientes ya liberados, priorizar mantener la corrección y resolver cualquier regresión conservando alcance. Un rollback de código **no** revierte modificaciones hechas previamente en Aiven por Fase 1 o usuarios.

**No se realizaron** `git commit`, `git push`, despliegues Azure/GitHub Pages/Netlify, consultas o escrituras sobre Aiven, ALTER/UPDATE SQL, notificaciones ni cambios en módulos en Nevera. Únicamente se generaron archivos locales para entrega.
