# FIX FASE 3 — Instalaciones · Administración — Guardado y auditoría

**Fecha:** 13/10/2026  
**Identificador:** `FIX_FASE_3_INSTALACIONES_ADMINISTRACION_GUARDADO_AUDITORIA_V001`  
**Base oficial verificada:** `ziSirrush/GestorMantto`, rama `main`, SHA `c344f4cddb6b7fa4dd7be3eaabb7357edcc2b76e` (commit «Version 100926.5», 09/10/2026).  
**Requisitos previos:** **Fase 1 V001 y Fase 2 V001 aplicadas**, exactamente en ese orden sobre esa base. El instalador de Fase 3 recalcula los hashes de ambas fases antes de escribir.  
**Estado:** entregable ZIP para instalación LOCAL. **No fue aplicado** a ningún repositorio, Aiven, Azure, GitHub Pages ni Netlify. **Sin E2E real**.

## 1. Qué cambia

Únicamente en **Instalaciones → Administración → proyecto seleccionado**:

- Main permanece **sin cambios visuales**: búsqueda, filtros de estatus/supervisor, listado de proyectos, paginación y Actualizar.
- Se conserva la **tabla de equipos** de Fase 1, todas las columnas que el contrato de permisos autoriza y paginación de 30 equipos.
- Se conserva la **edición fantasma por celda** de Fase 2, con originales y borradores en memoria.
- Se agrega el botón **Guardar cambios**. Solo el clic explícito, seguido de confirmación, inicia las solicitudes `PATCH`. Editar, aplicar o revertir un borrador **no escriben** en Aiven.
- El guardado admite **hasta 30 equipos por operación** (cada equipo puede contener varios campos de varios grupos). Si hay más, los restantes quedan pendientes para otra confirmación.
- Los equipos se guardan **secuencialmente**, uno por operación `PATCH`, con transacción y auditoría atómicas por equipo. **No existe transacción global entre todos los equipos**: ante falla, los anteriores confirmados permanecen guardados y los siguientes no se envían. El frontend lo informa explícitamente.
- Cada PATCH exitoso es seguido **inmediatamente** por un GET autenticado del mismo registro. Solo tras verificar el contenido actualizado se elimina su borrador. Al concluir se relee selectivamente la tabla del proyecto.
- Se detiene ante `409` de concurrencia, error de escritura, diferencia en relectura, cambio de contexto o permiso revocado. **No hay reintentos automáticos**.
- Nunca se usa `localStorage`, `sessionStorage` o IndexedDB para los borradores; no se crea tabla, columna ni permiso nuevo.

### 1.1 Endpoint nuevo

`PATCH /api/instalaciones/administracion/proyectos/:projectKey/equipos/:id/tabla`

Cuerpo: el **mismo contrato** del endpoint actual `/registros/:id/detalle`:

```json
{
  "groups": {
    "seguimiento": {
      "changes": {"avance_oc": "65%"},
      "expected": {"avance_oc": "60%"}
    },
    "equipo": {
      "changes": {"modelo": "Nuevo modelo"},
      "expected": {"modelo": "Modelo anterior"}
    }
  }
}
```

La ruta nueva usa `...accessGuard_cor` con **sesión + permiso funcional + puerta CORELLIAN INSTALACIONES + alcance** y vuelve a exigir `INSTALACIONES_ADMINISTRACION_ACCESO_VISUAL_MODULO.EDITAR` en el servicio existente; el Visor sigue sin escritura. **La pertenencia del equipo a `P:<id_proyecto>` o `R:<id_ins_fl>` se comprueba en el mismo `SELECT ... FOR UPDATE` que bloquea la fila**, antes de editarla. El servicio valida grupos, tipos, referencias de usuarios, valores originales (`expected`) y longitud; un conflicto devuelve `409`. No confía en la tabla ni el JS como autoridad de autorización.

### 1.2 Auditoría

Se reutilizan `ins_fl`, el `updateRecordById_cor` ya transaccional y el servicio existente `instalaciones-administracion.audit-service.js`, que inserta trazabilidad en `usuario_interacciones`. `UPDATE ins_fl` y auditorías se confirman en **la misma transacción MySQL**; cualquier error de auditoría provoca `ROLLBACK` **de ese equipo**. Se conserva el origen/usuario, registro, grupos y valores anteriores/posteriores que ya reporta el mecanismo de auditoría.

## 2. Archivos afectados

**Archivos preexistentes modificados en el checkout local (9), completos una vez aplicado el instalador:**

1. `modules/instalaciones-administracion/instalaciones-administracion_cor.js` — integra guardado manual, relectura, manejo de fallas y actualización de UI.
2. `modules/instalaciones-administracion/instalaciones-administracion-ghost_cor.js` — botón Guardar, bloqueo de edición durante envío y ACK selectivo de borradores.
3. `modules/instalaciones-administracion/instalaciones-administracion-ghost_cor.css` — estados del botón y feedback limitado a tabla secundaria.
4. `core/module-loader.js` — carga el helper de guardado antes del editor y cambia solo el cache bust de este módulo.
5. `index.html` — cambia **únicamente** el query string de `core/module-loader.js`.
6. `backend/src/modules/instalaciones-administracion/instalaciones-administracion.routes.js` — ruta PATCH con Guard existente.
7. `backend/src/modules/instalaciones-administracion/instalaciones-administracion.controller.js` — controlador para PATCH de tabla.
8. `backend/src/modules/instalaciones-administracion/instalaciones-administracion.service.js` — reutiliza `updateDetail_cor` añadiendo validación opcional de proyecto para la ruta nueva.
9. `backend/src/modules/instalaciones-administracion/instalaciones-administracion.repository.js` — verifica pertenencia dentro de `SELECT ... FOR UPDATE` (sin alterar endpoints antiguos si no reciben `projectKey`).

**Archivo nuevo del repositorio (1):**

10. `modules/instalaciones-administracion/instalaciones-administracion-save_cor.js` — planificación y envío secuencial validado, sin guardado automático.

**Auxiliares del ZIP, NO se copian al proyecto:** `installer/` con referencia exacta de Fase 1/Fase 2 para preflight, `tests/`, `README_FASE_3.md`, `MANIFEST_FASE_3.txt` y `SHA256SUMS.txt`.

Los archivos grandes `instalaciones-administracion_cor.js`, `core/module-loader.js`, `index.html` y los cuatro archivos de backend se reconstruyen como **archivos completos** en el checkout local mediante el instalador y sus anclas verificadas. Los dos archivos Ghost modificados y el nuevo motor de guardado ya vienen completos en el ZIP. El ZIP no sobrescribe archivos fuera de esta lista.

## 3. Aplicación manual en PowerShell (Windows)

Requisitos: Node.js y Git disponibles; checkout con historial que contenga el commit base; Fases 1 y 2 previamente aplicadas. **Primero respalda tu copia local / realiza commit de cambios propios** fuera de este FIX, si procede. Descomprime el ZIP y coloca la carpeta del FIX en Descargas.

```powershell
$REPO = 'C:\Users\T14s\Downloads\mantto_gestor_frontend'
$FIX  = "$env:USERPROFILE\Downloads\FIX_FASE_3_INSTALACIONES_ADMINISTRACION_GUARDADO_AUDITORIA_V001"

node --test "$FIX\tests\instalaciones-admin-fase3-save.test.js" "$FIX\tests\instalaciones-admin-fase3-ghost.test.js" "$FIX\tests\instalaciones-admin-fase3-transforms.test.js"
if ($LASTEXITCODE -ne 0) { throw 'QA de Fase 3 fallido. No instalar.' }

node "$FIX\installer\aplicar-fase3.js" "$REPO" --check
if ($LASTEXITCODE -ne 0) { throw 'Preflight rechazado; Fase 1/2 no coincide o hubo cambios. No instalar.' }

node "$FIX\installer\aplicar-fase3.js" "$REPO" --apply
if ($LASTEXITCODE -ne 0) { throw 'Fase 3 NO se instaló completamente. Revisar salida.' }

Set-Location $REPO
git diff --check
git status --short
git diff --stat
```

`--check`: solo lee el checkout y crea una carpeta TEMPORAL para reconstruir Fases 1 y 2 a partir de `git show c344f4c:archivo`; comprueba hashes de **11 archivos** y sintaxis. **No escribe en el repositorio**. `--apply`: si todo coincide, modifica los 9 archivos existentes y crea 1 nuevo; revierte las escrituras locales intentadas si el proceso arroja error. Si encuentra archivos modificados fuera de las Fases exactas, **falla cerrado y no pisa cambios ajenos**. No ejecuta `git reset`, `git add`, `git commit`, `git push`, ni migraciones/despliegues.

Si `--check` rechaza un archivo, **no lo fuerces**. Confronta el diff y prepara un rebase explícito sobre tu estado local; este instalador no trata como equivalente una versión distinta.

## 4. QA obligatorio antes de desplegar

1. **Main**: comparar visualmente antes/después; filtros, búsqueda, Actualizar, paginación de proyectos idénticos.
2. **Tabla autorizada**: seleccionar proyecto PP NS con varios equipos, atravesar 2 páginas; solo equipos y columnas dentro del alcance; PWA móvil con desplazamiento horizontal.
3. **No escritura sin confirmación**: editar, aplicar y revertir; verificar que Network no contiene PATCH hasta pulsar Guardar y confirmar; cerrar editor abierto sin aplicar.
4. **Guardado**: cambiar 2 campos de grupos diferentes en un equipo; confirmar un solo PATCH con `groups`, relectura GET, refresco de tabla y un historial de auditoría por grupo en `usuario_interacciones`.
5. **Equipos múltiples**: cambios diferentes en al menos 2 equipos, verificar secuencia PATCH→GET por equipo y contador correcto. Probar más de 30 equipos si el proyecto lo permite; los demás quedan pendientes.
6. **Concurrencia**: cambiar externamente el mismo campo después del borrador y antes del PATCH: debe producir `409`, rollback y conservar el borrador para revisión; no avanzar a equipos siguientes.
7. **Falla de auditoría**: simular en un ambiente de laboratorio (no en Aiven productivo) un error de inserción de auditoría y confirmar rollback también de `ins_fl`.
8. **Seguridad**: probar usuario con `ACCESO_VISUAL+EDITAR`, solo lectura, Visor y fuera de scope CORELLIAN. Probar llamada directa PATCH con ID de equipo de **otro proyecto**; debe denegarse (`404`/sin modificación) aun si el usuario ve ambos proyectos.
9. **Cambio de responsables**: comprobar el caso en que la edición revoca alcance durante el guardado: detener secuencia, no retener información sensible, no reintentar.
10. **Integración**: QA Local → GitHub Pages validación online; Azure backend y Aiven con autorización. **Netlify producción SOLO mediante despliegue manual posterior**, nunca implícito.

### Pruebas realmente ejecutadas en la generación

- `node --check`: archivos JS nuevos y transformador, **correctos**.
- `node --test` sobre **21 pruebas unitarias y simuladas** del editor, planificador, conflictos, flujo PATCH/GET, transformaciones y pertenencia SQL: **21/21 PASS**. Son pruebas simuladas, **no** certificación E2E.
- E2E navegador, un checkout real de las Fases 1/2, Azure y una BD Aiven conectada: **NO ejecutados**.
- Riesgo especial: editar `id_proyecto` y `referencia_sitio` modifica la identidad lógica del equipo; este FIX conserva las restricciones MySQL y validaciones existentes, **no** propaga el cambio a otras integraciones. Verificar explícitamente esa operación antes de producción.
- No hay datos verificados de rendimiento/concurrencia a carga real. No afirmar que Aiven está saturado ni que este cambio aumenta un porcentaje concreto de rendimiento.

## 5. Reversión controlada

Restaurar **exclusivamente** los nueve archivos modificados a su estado **después de Fase 2** y borrar solo el nuevo `instalaciones-administracion-save_cor.js`, tras revisar `git status` y `git diff` para no perder trabajo ajeno. Como `index.html`, `core/module-loader.js` y el JS original ya se cambiaron en Fases 1/2, **no restaurarlos directamente al commit `HEAD`** salvo que deliberadamente se quieran revertir también las fases previas. No se requiere rollback SQL ni se elimina auditoría histórica legítima de pruebas autorizadas.

## 6. Estado de entrega y normas

- Base y funciones revisadas en GitHub `main` al **13/10/2026**; los archivos reales de Fases 1/2 provienen de los ZIP entregados en esta conversación.
- Constitución aplicada: incremental y fail-closed; sesión/permiso/puerta/scope; Aiven como fuente única; no creación de tablas ni permisos; auditoría; recarga inmediata; modo Visor de solo lectura; fechas sin cambio de formato almacenado; PWA; no modificar módulos en Nevera.
- **No se han ejecutado escrituras externas** a GitHub, Aiven, Azure, GitHub Pages o Netlify.
