# Mantto Gestor — FIX 3 · Edición múltiple del mismo proyecto

**Identificador:** `FIX_3_INSTALACIONES_ADMINISTRACION_EDICION_MULTIPLE_V001`  
**Fecha:** 09/10/2026  
**Base oficial comprobada:** GitHub `ziSirrush/GestorMantto`, rama `main`, commit `ab0081d6bba66a2583674aab9f077e1cf3482092` (`Version 100826.4`, publicado 08/10/2026).  
**Dependencias obligatorias:** `FIX_1_INSTALACIONES_ADMINISTRACION_REDISENO_V001` **y** `FIX_2_INSTALACIONES_ADMINISTRACION_DETALLE_EQUIPO_V001`, aplicados sobre la base oficial antes de extraer este ZIP. No asumir que FIX 1/2 están en `main`: se utilizaron las copias originales de los ZIP entregados, superpuestas en ese orden.  
**Naturaleza:** FIX incremental para el módulo existente. No es creación de módulo ni migración SQL.

## 1. Causa y resultado

La lista de **Instalaciones → Administración → Proyectos → Equipos** solo permitía abrir una ficha individual. No había un guardado común de varios equipos de un **mismo** proyecto. Este FIX añade:

- Casillas de selección en el listado de equipos, **únicamente** cuando existe `id_proyecto` (PP NS) y el usuario tiene permisos de edición.
- Selección de **2 a 20 equipos** dentro del proyecto actualmente abierto, incluso entre páginas del listado. Cambiar de proyecto, filtros o sesión elimina la selección. Los registros sin PP NS no se agrupan ni admiten edición múltiple.
- Botón **Editar seleccionados**, que consulta de nuevo cada equipo desde backend, verifica que sigue perteneciendo al mismo `id_proyecto` y muestra exclusivamente grupos/campos editables autorizados.
- **Checkbox por campo**: solamente se envían los campos expresamente marcados para aplicar. Los demás permanecen intactos. Vaciar un campo de texto/fecha/responsable seleccionado significa enviar `null`.
- Confirmación previa al guardado; respuesta de operación; recarga selectiva inmediata de equipos, filtros y proyectos.
- El detalle y el guardado individual de FIX 2 permanecen vigentes.

## 2. Contrato de API y seguridad

Ruta **nueva** (ya sometida al Guard central de módulo, sesión, puerta CORELLIAN y alcance):

`PATCH /api/instalaciones/administracion/proyectos/:projectKey/equipos/edicion-multiple`

Ejemplo (solo para ilustrar la forma del contrato; **no** se ejecuta):

```json
{
  "ids": [120, 121],
  "groups": {
    "proyecto": { "changes": { "estatus": "En montaje" } },
    "seguimiento": { "changes": { "comentarios_fl": "Actualizado" } }
  },
  "expected": {
    "120": { "estatus": "En proceso", "comentarios_fl": "Anterior A" },
    "121": { "estatus": "En proceso", "comentarios_fl": "Anterior B" }
  }
}
```

`projectKey` debe ser `P:<id_proyecto>`; **no acepta `R:<id_ins_fl>`**. En backend:

1. Revalidar `PROYECTO.VER` o `PROYECTO.EDITAR`, y `EDITAR` de **cada grupo** solicitado; bloquear escrituras desde Visor de Usuarios.
2. Revalidar IDs (mínimo 2, máximo 20, únicos), `expected` original **por registro y por campo**, validación de datos existentes y políticas de campos bloqueados (como `id_proyecto`, `referencia_sitio` y derivados pendientes).
3. Resolver alcance mediante el servicio CORELLIAN vigente, no crear un segundo motor.
4. En **una transacción**, bloquear los registros por PK `id_ins_fl` en orden ascendente con `FOR UPDATE`, verificar su acceso y que **todos** tengan exactamente el mismo `id_proyecto` exigido por la URL, y comparar valores `expected` antes de ejecutar el **primer UPDATE**.
5. Actualizar solo diferencias reales de campos seleccionados. Insertar auditoría `AUDITAR_CAMBIO` **por equipo y grupo efectivamente modificado**, mediante `usuario_interacciones` y la **misma conexión SQL**.
6. Si falta un registro, pertenece a otro proyecto, hay conflicto 409 o falla alguna auditoría, **ROLLBACK del lote completo**. No se devuelve la fila posterior para impedir fugas si algún equipo cambió de alcance.

No amplía roles ni permisos. Reutiliza exactamente las tablas `ins_fl`, `usuarios`, `usuario_interacciones` y catálogo de permisos ya existentes. **No hay SQL de creación ni ALTER.**

### Límites deliberados

Un lote modifica el mismo conjunto de campos comunes para todos los registros seleccionados; no permite mezclar proyectos ni definir cambios diferentes por equipo dentro del mismo envío (para eso continúa disponible Detalle individual). Se limitan a **40 campos seleccionados** por lote y **20 equipos** por operación para acotar bloqueos/auditorías. Si algunos valores ya coinciden, se omite UPDATE/auditoría solo en esos registros/campos.

## 3. Archivos incluidos (completos y con rutas reales)

**Código modificado:**

```text
backend/src/modules/instalaciones-administracion/instalaciones-administracion.repository.js
backend/src/modules/instalaciones-administracion/instalaciones-administracion.service.js
backend/src/modules/instalaciones-administracion/instalaciones-administracion.controller.js
backend/src/modules/instalaciones-administracion/instalaciones-administracion.routes.js
modules/instalaciones-administracion/instalaciones-administracion_cor.js
modules/instalaciones-administracion/instalaciones-administracion_cor.html
modules/instalaciones-administracion/instalaciones-administracion-form_cor.css
```

**Pruebas:** `tests/instalaciones-administracion-fix3-edicion-multiple.test.js` (nuevo) y `tests/instalaciones-administracion-fase5-integracion-qa.test.js` (ajuste del token de versión de FIX 3).

**Auxiliares locales:** `ACTUALIZAR_CACHE_BUST_FIX_3.ps1`, `EJECUTAR_QA_FIX_3.ps1`, README, MANIFEST, SHA256SUMS. No incluye archivos globales completos `index.html` o `core/module-loader.js`: el script PowerShell actualiza exclusivamente dos tokens específicos, preservando cambios ajenos.

## 4. Instalación y verificación local

1. Verificar que el proyecto local tenga aplicados **FIX 1 y FIX 2 completos**, incluidos sus scripts de caché. Revisar `git status` y respaldar cambios propios. No sustituir el repositorio por el contenido del ZIP.
2. Extraer **este ZIP en la raíz** del repositorio, conservando carpetas; reemplazar exclusivamente las rutas incluidas.
3. Ejecutar en PowerShell **desde la raíz**:

```powershell
& .\ACTUALIZAR_CACHE_BUST_FIX_3.ps1
& .\EJECUTAR_QA_FIX_3.ps1
git status
git diff --check
git diff
```

El script de caché revisa las precondiciones de FIX 2 y FIX 3; si el código/tokens no coinciden, **no altera los dos archivos globales**. También es idempotente. No ejecuta ningún `git push`, SQL, Azure ni Netlify.

4. En **Local**, confirmar edición individual existente y edición múltiple con proyectos reales/roles de prueba. Desplegar backend autorizado en **Azure** antes de validar online el nuevo PATCH. Validar frontend en **GitHub Pages** y promover **manualmente** a **Netlify** solo tras aprobar **FIX 4** y pruebas E2E.

## 5. Validaciones ejecutadas y pendientes

**Ejecutadas** en directorio aislado reconstruido con los ZIP de FIX 1 + FIX 2: `node --check` del nuevo JS y backend, más **17/17 pruebas automáticas aisladas FIX 3** con dobles de SQL, permisos, alcance, sesión y navegador. Cubren lote de dos equipos, prohibición de mezclar proyectos, PP NS obligatorio, permisos, Visor, 409, rollback total ante auditoría fallida, no-op, cambios parciales, selección por UI, petición PATCH única y lectura individual de `expected`. **No equivalen a E2E ni a validación con Aiven real.**

**Pendiente:** ejecutar la suite de regresión completa mediante `EJECUTAR_QA_FIX_3.ps1` en un clon íntegro, probar permisos/alcances reales y transacciones en laboratorio Aiven, conflictos multiusuario y visibilidad tras cambiar supervisor, respuesta del backend Azure, responsive/PWA, y revisar si GAS/Sheets vuelve a sobrescribir campos editados. **No puedo confirmar el esquema de Aiven activo, la ejecución del SQL de permisos ni su despliegue** con las fuentes locales disponibles.

## 6. Escrituras y siguiente paso

**Escrituras realizadas:** creación del ZIP local, **ninguna** en GitHub, Aiven, Azure, Netlify o GAS.

**Pendiente:** **FIX 4 — Integración y QA final**, especialmente pruebas reales de concurrencia, permisos, rollback, sincronización y flujo `Local → GitHub Pages → Netlify` (promoción manual).
