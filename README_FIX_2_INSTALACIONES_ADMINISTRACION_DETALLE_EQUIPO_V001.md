# Mantto Gestor — FIX 2 · Detalle y edición individual de Equipo

**Identificador:** `FIX_2_INSTALACIONES_ADMINISTRACION_DETALLE_EQUIPO_V001`  
**Fecha:** 08/10/2026  
**Base oficial verificada:** `ziSirrush/GestorMantto`, rama `main`, commit `ab0081d6bba66a2583674aab9f077e1cf3482092` (`Version 100826.4`).  
**Dependencia obligatoria:** `FIX_1_INSTALACIONES_ADMINISTRACION_REDISENO_V001` aplicado **completamente** antes de este ZIP.  
**Tipo:** corrección incremental de interfaz y guardado de **un equipo**, no implementación de módulo ni edición de varios equipos.

## Diagnóstico

La Fase 4 y el FIX 1 permitían editar/guardar un solo **grupo** cada vez. Cambiar campos pertenecientes a varios grupos implicaba varios guardados, varias recargas y la posibilidad de dejar una ficha parcialmente modificada. El FIX 1 ya aporta **Proyectos → Equipos → Detalle** con filtros por estatus y supervisor; ese navegador no se altera aquí.

## Corrección funcional

- Al abrir un equipo se presenta su **ficha completa** con secciones desplegables, solo de los grupos autorizados para `VER`.
- El botón **Editar ficha** permite modificar varios campos de una o varias secciones del **mismo `id_ins_fl`**. Los grupos sin permiso `EDITAR` son de solo lectura.
- **Un único botón de Guardar** envía exclusivamente los campos realmente modificados, agrupados por permisos, junto con el valor `expected` de cada uno para resolver conflictos.
- Nuevo endpoint: **`PATCH /api/instalaciones/administracion/registros/:id/detalle`**. Forma del cuerpo:

```json
{
  "groups": {
    "proyecto": {
      "changes": { "estatus": "Terminado" },
      "expected": { "estatus": "En proceso" }
    },
    "seguimiento": {
      "changes": { "comentarios_fl": "Revisado" },
      "expected": { "comentarios_fl": "Pendiente" }
    }
  }
}
```

- La validación de valores, columnas editables y política de campos bloqueados reutiliza las funciones existentes de Fases 4–5. No autoriza `id_proyecto`, `referencia_sitio` ni derivados pendientes.
- El backend valida `EDITAR` **por cada grupo**, aplica Guard General CORELLIAN + permiso de acceso al módulo + alcance de registro, bloquea el registro con `FOR UPDATE`, verifica **todos** los `expected` y realiza **un solo UPDATE** dentro de una transacción.
- Si cambian varios grupos, crea una entrada de auditoría `AUDITAR_CAMBIO` **por cada grupo efectivamente modificado**, en la **misma transacción** de `ins_fl`. Cualquier fallo de auditoría o conflicto 409 revierte **todos** los cambios de ese guardado.
- Tras guardar, el cliente solicita de nuevo detalle, filtros y listado. Si cambió el alcance del equipo o la relectura falla, **no muestra una ficha posterior sin autorización**.
- El endpoint histórico `PATCH .../grupos/:grupo` sigue disponible para compatibilidad; no se cambian sus contratos.

**Fuera del alcance del FIX 2:** selección/edición simultánea de equipos, cambios de proyecto y nuevas reglas de asignación de supervisores. La edición múltiple limitada a equipos del mismo proyecto corresponde al **FIX 3**.

## Archivos de código modificados (completos)

```text
backend/src/modules/instalaciones-administracion/instalaciones-administracion.routes.js
backend/src/modules/instalaciones-administracion/instalaciones-administracion.controller.js
backend/src/modules/instalaciones-administracion/instalaciones-administracion.service.js
modules/instalaciones-administracion/instalaciones-administracion_cor.js
modules/instalaciones-administracion/instalaciones-administracion_cor.html
modules/instalaciones-administracion/instalaciones-administracion-form_cor.css
```

**Pruebas:**

```text
tests/instalaciones-administracion-fix2-detalle-equipo.test.js  (nuevo)
tests/instalaciones-administracion-fase3-frontend-base.test.js
tests/instalaciones-administracion-fase4-formularios-guardado.test.js
tests/instalaciones-administracion-fase5-integracion-qa.test.js
```

**Herramientas y documentación:** `ACTUALIZAR_CACHE_BUST_FIX_2.ps1`, `EJECUTAR_QA_FIX_2.ps1`, este README, MANIFEST y SHA256SUMS. No se incluyen copias de `index.html`, `core/module-loader.js` ni otros módulos para no sobrescribir cambios ajenos.

## Instalación local

1. Confirmar que el repositorio local contiene **FIX 1 aplicado**, incluidos sus cambios de backend/frontend y `ACTUALIZAR_CACHE_BUST_FIX_1.ps1`. Revisar `git status` y respaldar cambios propios.
2. Extraer **este ZIP en la raíz del repositorio**, sobrescribiendo **solo** los archivos incluidos. No copiarlo dentro de `/backend`.
3. Desde PowerShell, en la raíz, ejecutar:

```powershell
& .\ACTUALIZAR_CACHE_BUST_FIX_2.ps1
& .\EJECUTAR_QA_FIX_2.ps1
git diff --check
git status
git diff
```

4. El actualizador de caché es idempotente y **falla cerrado** si falta FIX 1 o los tokens son inesperados. Solo modifica `core/module-loader.js` e `index.html`, tras prevalidar ambos archivos.
5. Para probar vía web, desplegar primero el backend en **Azure** (nuevo PATCH), después validar frontend **Local → GitHub Pages** y, solo tras aprobación, promover **manualmente** a **Netlify**. La extracción local del ZIP **no implica despliegue**.

## QA y límites de verificación

**Ejecutado en un entorno local aislado:** `node --check` del código JS y **48/48 pruebas locales** de FIX 1, FIX 2 y regresión de Fases 4–6; usa dobles de MySQL, permisos, auditoría y navegador. Cubre guardado multigrupo sobre un único ID, transacción única, 403 por grupo, Viewer, 409, ROLLBACK por fallo de auditoría y una única llamada de frontend. El contrato histórico de Fase 3 se actualizó en el paquete, pero **no se ejecutó su suite completa** por no disponer del repositorio íntegro local en este entorno; debe verificarse con `EJECUTAR_QA_FIX_2.ps1` sobre la copia completa.

**No probado / pendiente:** consultas reales en Aiven (esquema activo no confirmado), rutas desplegadas en Azure, permisos y alcances vivos, responsive/PWA en dispositivos físicos, concurrencia E2E, sincronización GAS que pudiera sobrescribir campos y promoción manual de Netlify. No se debe afirmar que FIX 2 está desplegado o validado E2E.

**Sin cambios a base de datos:** no agrega SQL, tablas, columnas, índices ni permisos. Reutiliza `ins_fl`, `usuario_interacciones` y los 23 permisos de Instalaciones · Administración existentes.

**Escrituras realizadas:** solo se generó el ZIP local. **GitHub, Aiven, Azure y Netlify permanecen intactos.**

## Fases pendientes del rediseño

- **FIX 3:** editar **varios equipos exclusivamente dentro del mismo proyecto**, comprobando pertenencia por backend.
- **FIX 4:** validación integral y QA final en los entornos autorizados.
