# Mantto Gestor — FIX 4 · Integración y QA final V001

**Fecha:** 09/10/2026  
**Identificador:** `FIX_4_INSTALACIONES_ADMINISTRACION_INTEGRACION_QA_V001`  
**Base GitHub comprobada:** `ziSirrush/GestorMantto` · `main` · commit `ab0081d6bba66a2583674aab9f077e1cf3482092` (`Version 100826.4`, 08/10/2026).  
**Base funcional para construir este FIX:** ZIP de **FIX 1 + FIX 2 + FIX 3 V001**, superpuestos en ese orden sobre el código GitHub. **No se asume que los FIX 1–3 ya estén en `main`.**  
**Naturaleza:** cierre técnico y paquete de QA incremental, NO un módulo nuevo. **No implica aprobación de despliegue.**

## 1. Diagnóstico y corrección funcional

El endpoint legado `PATCH /api/instalaciones/administracion/registros/:id/grupos/:grupo` todavía devolvía la fila posterior del grupo. Al modificar `id_sup`, `id_asesor` o `id_admin`, el usuario podía **perder alcance CORELLIAN durante la transacción**, pero recibir en la respuesta valores de un registro al que ya no debe tener acceso. Los PATCH modernos de FIX 2/3 ya evitan esta filtración.

**FIX 4:** ese PATCH individual por grupo ahora devuelve **solo metadatos de ejecución** (`group`, `changed`, `changed_fields`, `audit`) y **no devuelve `data`, `before` ni `after`**. La vista existente ya hace un GET de detalle después del PATCH y, si perdió alcance, deja de mostrarlo. Se mantienen exactamente las comprobaciones de sesión, permiso funcional, puerta CORELLIAN, record scope y auditoría transaccional; no cambia la firma ni la semántica del PATCH.

Además se incluyen **tests y herramientas de QA final** para el recorrido Proyectos → Equipos → Ficha individual / Edición múltiple del **mismo** `id_proyecto` con filtros por estatus/supervisor y permisos por sección.

## 2. Archivos del ZIP (completos y únicos respecto de FIX 3)

**Código modificado:**

```text
backend/src/modules/instalaciones-administracion/instalaciones-administracion.service.js
```

**Nuevos archivos de QA y documentación:**

```text
tests/instalaciones-administracion-fix4-integracion-qa.test.js
validation/instalaciones-administracion-fix4-readonly-smoke.js
database/QA_FIX_4_INSTALACIONES_ADMINISTRACION_SOLO_LECTURA_V001.sql
docs/MATRIZ_QA_FIX_4_INSTALACIONES_ADMINISTRACION_V001.md
EJECUTAR_QA_FIX_4.ps1
README_FIX_4_INSTALACIONES_ADMINISTRACION_INTEGRACION_QA_V001.md
MANIFEST_FIX_4_INSTALACIONES_ADMINISTRACION_INTEGRACION_QA_V001.txt
SHA256SUMS_FIX_4_INSTALACIONES_ADMINISTRACION_INTEGRACION_QA_V001.txt
```

**Sin cambios a** frontend, rutas, módulos vecinos, `core/module-loader.js`, `index.html`, migraciones o permisos. **No se requiere actualizar el cache** porque no se modificaron recursos del navegador. El QA exige que ya esté aplicado el `ACTUALIZAR_CACHE_BUST_FIX_3.ps1`.

## 3. Instalación LOCAL (sin escrituras remotas)

1. Verificar que el clon corresponda al `main` oficial comprobado y revisar `git status`, ramas y cambios locales. Si `main` avanzó o el repositorio tiene modificaciones sobre archivos afectados, **detenerse y reconciliar**; no sobrescribir trabajo nuevo. Respaldar cambios propios.
2. Haber aplicado **FASE 4–6 y los FIX 1, 2 y 3** completamente, incluyendo sus ajustes locales de cache. Verificar que el frontend contiene `VERSION_COR='20261009-fix3-v001'` y la ruta de edición múltiple existe.
3. Extraer **este ZIP en la raíz** del repositorio (`.../mantto_gestor_frontend`), conservando carpetas, sobrescribiendo **solo** los archivos listados.
4. En PowerShell dentro de la raíz:

```powershell
& .\EJECUTAR_QA_FIX_4.ps1
git status
git diff --check
git diff -- backend/src/modules/instalaciones-administracion/instalaciones-administracion.service.js
```

El script verifica sintaxis, contrato de código, cache de FIX 3 y ejecuta los tests previos de Fases 1–6 + FIX 1–4. **No ejecuta SQL, escrituras HTTP, Git push ni despliegues**. No se ha ejecutado PowerShell/Windows desde este entorno Linux; verificarlo localmente.

## 4. Verificación ONLINE opcional — SOLO LECTURA

Usa una sesión de QA con JWT válido, permisos asignados y, cuando aplique, token de dispositivo; no mostrar credenciales en consola ni pasarlas como parámetros.

```powershell
$env:MANTTO_QA_TOKEN = '<JWT_QA>'
$env:MANTTO_QA_DEVICE_TOKEN = '<TOKEN_QA_OPCIONAL>'
# Opcional: otro JWT VALIDO de usuario que SI puede iniciar sesion,
# pero al que debe NEGARSE el modulo (se exige HTTP 403 real):
$env:MANTTO_QA_DENIED_TOKEN = '<JWT_QA_DENEGADO>'
node .\validation\instalaciones-administracion-fix4-readonly-smoke.js --readonly --base-url https://TU-AZURE-API.azurewebsites.net --record-id 123 --denied-record-id 999
```

**IDs de ejemplo:** usar solo registros autorizados de QA, y un ID realmente fuera de alcance para el segundo. Las tres variables opcionales pueden omitirse si no aplican; el script informa los controles omitidos. El smoke **envía únicamente GET**, no PATCH/POST, no imprime tokens ni valores de registros; con redirigir HTTP deshabilitado. Debe ejecutarse **solo con autorización y en el backend correcto**. El SQL de QA también es **solo SELECT**, a ejecutar manualmente y con credenciales de lectura. No certifica auditorías de escritura o rollback.

## 5. Validaciones ejecutadas en la generación

- GitHub `main` y los ZIP FIX 1, FIX 2 y FIX 3 revisados; base sin sobrescrituras globales.
- `node --check` del JS de backend entregado, del nuevo smoke y del test: sin errores sintácticos.
- Test `tests/instalaciones-administracion-fix4-integracion-qa.test.js`: **10/10 aprobados con dobles, sin red**, cubriendo fuga de datos post-PATCH, permisos estructurales, restricciones de lote, proyección, consulta de proyectos/equipos, rechazo sin permiso y scripts read-only.
- Suite local aislada **F6 + FIX 1 + FIX 3 + FIX 4**: **42/42 pruebas aprobadas** con mocks. Las demás suites se ejecutarán en un clon íntegro mediante el runner PS1. Las pruebas integrales requieren un clon íntegro porque `index.html`, `core/router.js`, `instalaciones-administracion.constants.js` y `validation.js` no forman parte de estos ZIP incrementales.
- **NO EJECUTADO:** PowerShell en Windows, `EJECUTAR_QA_FIX_4.ps1` contra repositorio completo, DB/Aiven real, Azure, GitHub Pages, Netlify, pruebas E2E de escrituras/transacciones, verificación en navegador móvil y sincronización GAS. **No puedo confirmar esto** sin evidencia de esos entornos.

## 6. Criterios de cierre

No declarar producción liberada hasta que se aprueben todos los P0 de `docs/MATRIZ_QA_FIX_4_INSTALACIONES_ADMINISTRACION_V001.md`, incluidos los 23 permisos reales, acceso visual por rol/usuario, alcance por registro, conflictos 409, auditorías atomizadas, rollback integral, pruebas de sincronización GAS y QA visual en PWA. Luego promover **Local → GitHub Pages → Netlify (manual)**; backend en Azure y fuente Aiven.

**Escrituras efectuadas:** únicamente archivos locales / ZIP de entrega. **No** se modificó GitHub, Aiven, Azure, Netlify ni GAS.

**Serie FIX de rediseño:** FIX 1 Rediseño/Filtros → FIX 2 Detalle individual → FIX 3 Edición múltiple del mismo proyecto → FIX 4 Integración/QA (éste). **No hay un FIX 5 aprobado.**
