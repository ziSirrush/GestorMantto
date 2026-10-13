# Mantto Gestor — Instalaciones → Administración V2 · FIX Fase 1/4

**Fase:** 1. Backend y reglas de negocio. **Versión del FIX:** V001 (13/10/2026).  
**Fuente oficial comprobada:** `ziSirrush/GestorMantto`, `main`, commit `3a7b66e83e880d32d511649d555f19935596bb60` (`Version 101326.4`).  
**Fuente de datos:** Aiven MySQL, tablas ya existentes `ins_fl`, `usuarios`, `usuarios_rel_admin`, `usuario_interacciones` (mediante servicio central de auditoría).  
**Alcance exclusivo:** backend de Instalaciones → Administración. No modifica Main, otros módulos visuales, configuración de permisos, tablas ni columnas. **Este ZIP no lleva instalador ni parche; contiene los archivos completos en sus rutas definitivas.**

## 1. Entrega y límites de la fase

La Fase 1 **prepara** el backend para Fases 2 (tabla, edición individual y listas), 3 (selección múltiple/botón «Deseleccionar todo») y 4 (QA integrado). **No sustituye todavía la interfaz de borradores, no cambia su ubicación de botones y no activa el autoguardado en el navegador.** Las rutas anteriores de edición siguen disponibles durante la transición, pero ahora rechazan escribir IDs o campos calculados desde la TABLA.

Se entregan **4 archivos completos modificados y 3 archivos nuevos del backend, más 1 prueba nueva**:

| Ruta relativa | Acción | Motivo |
| --- | --- | --- |
| `backend/src/bootstrap.js` | Modificado | Inicia y detiene el job diario de cálculos con la BD disponible. |
| `backend/src/modules/instalaciones-administracion/instalaciones-administracion.routes.js` | Modificado | Agrega GET catálogo / PATCH individual y lote; protege las rutas legadas de la tabla. Conserva Guard CORELLIAN. |
| `backend/src/modules/instalaciones-administracion/instalaciones-administracion.tabla-service.js` | Modificado | Incluye `rel_admin` virtual (iniciales separadas por coma), condicionado a lectura de grupos autorizados y alcance del proyecto. |
| `backend/src/modules/instalaciones-administracion/instalaciones-administracion.field-policy.js` | Modificado | `recepcion_carpeta` acepta fecha calendario; `fecha_liberacion_ajuste` es TEXTO (`SI` o fecha). |
| `backend/src/modules/instalaciones-administracion/instalaciones-administracion.auto-rules.js` | Nuevo | Códigos 01-SUS...08-T y nombres existentes; calculados, listas de solo lectura, fechas CDMX. |
| `backend/src/modules/instalaciones-administracion/instalaciones-administracion.auto-service.js` | Nuevo | Escritura segura por celda y por lote; iniciales→ID, rel_admin, validación, expected, transacción/auditoría. |
| `backend/src/jobs/instalacionesAdministracionCalculados.job.js` | Nuevo | Actualiza calculados almacenados en `ins_fl` diariamente, con `GET_LOCK` y comparación optimista. |
| `backend/tests/instalaciones-administracion-auto-v2.test.js` | Nuevo | 37 pruebas unitarias/simuladas de negocio, seguridad, persistencia y rutas. |

## 2. Reglas funcionales aplicadas

- **IDs/controles nunca editables manualmente desde la tabla:** `id_ins_fl`, `id_proyecto`, `id_sup`, `id_asesor`, `id_admin`, `activo`, `created_at`, `updated_at`. Permanecen disponibles internamente para identidad, permisos y FK; ocultarlos **visualmente** corresponde a Fase 2.
- **Derivados visibles, no editables:** `estatus_completo`, `dias_sin_visita`, `dias_sin_ccnr`, `dias_restantes`. Se calculan desde `estatus`, `fecha_visita`, `fecha_ccnr` y la fecha de fin de montaje **modificada primero**, o planeada como respaldo. Se usa calendario civil de `America/Mexico_City`, sin desfase de UTC. Una fecha futura puede producir un número negativo. Los campos se **persisten** en `ins_fl`.
- `estatus`: únicamente la lista 01-SUS, 02-OC, 03-PM, 04-M, 05-PA, 06-A, 07-PE, 08-T. `estatus_completo` toma el nombre oficial utilizado por el Dashboard de Instalaciones.
- `vendedor`: solo iniciales de usuarios activos del área exacta `Ventas`; el servidor asigna `id_asesor` a su `id_SB`.
- `supervisor_fl`: solo iniciales de usuarios activos del área exacta `Instalaciones`; asigna `id_sup` automáticamente.
- **`rel_admin`:** se lee de `usuarios_rel_admin`, concatenando las iniciales relacionadas con `', '`, como ya hace `/api/ins-fl`. Si no hay relación, se muestra el usuario de `ins_fl.id_admin` cuando exista. `rel_admin` es una **columna virtual** (no se agrega a la BD).
- **`id_admin` es un BIGINT FK individual**, no un campo CSV. Si el nuevo asesor tiene una única relación activa, se asigna esa FK; si tiene varias, solo se conserva `id_admin` previo cuando pertenezca a las relaciones activas; si no, se deja `NULL` y la lista de administrativos se muestra en `rel_admin`. Esto evita asignaciones arbitrarias o escribir `'7,8'` en una FK numérica.
- `recepcion_carpeta`: fecha ISO al guardar, calendario en Fase 2. `fecha_liberacion_ajuste`: texto libre validado por longitud, admite `SI` y fechas. Las demás fechas/porcentajes/montos conservan las normalizaciones existentes.
- **Auditoría humana:** se reutiliza `instalaciones-administracion.audit-service.js`/`usuario_interacciones`, en la **misma transacción** que cada UPDATE de `ins_fl`. Se auditan campos manuales, IDs relacionados asignados y campos recalculados que efectivamente cambian. Si falla la auditoría, hay ROLLBACK.
- **Permisos:** el GET de catálogo y ambos PATCH directos requieren `INSTALACIONES_ADMINISTRACION_ACCESO_VISUAL_MODULO.EDITAR`, además de acceso visual, puerta CORELLIAN/INSTALACIONES, alcance real y no estar en modo Visor. No se concede ningún permiso nuevo.
- **Edición múltiple:** 2 a 20 equipos, mismo `id_proyecto`, exactamente una columna manual por operación y `expected` de cada equipo; primero bloquea y verifica todos, luego escribe o revierte **todos**. La confirmación del usuario es responsabilidad de la Fase 3 frontend.

**Fechas legadas:** se admiten `AAAA-MM-DD` y `DD/MM/AAAA` para cálculos. Los marcadores vacíos (`-`, `N/A`, etc.) producen `NULL` en sus contadores. Fechas malformadas que no sean marcadores NO causan sobrescritura silenciosa del valor calculado anterior. Antes del primer despliegue revisar esta regla en datos de prueba.

## 3. Endpoints nuevos (base `/api/instalaciones`)

- `GET /administracion/catalogos-edicion` → ocho estatus, opciones de vendedores y supervisores con `id_SB`/iniciales, `rel_admin_por_asesor` y columnas protegidas.
- `PATCH /administracion/proyectos/:projectKey/equipos/:id/edicion-directa` → **una celda**. Ejemplo:

```json
{"changes":{"estatus":"08-T"},"expected":{"estatus":"02-OC"}}
```

- `PATCH /administracion/proyectos/:projectKey/equipos/edicion-multiple-directa` → **una celda**, mismo valor para todos; entre 2 y 20 `id_ins_fl`:

```json
{"ids":[101,102,103],"changes":{"estatus":"08-T"},"expected":{"101":{"estatus":"02-OC"},"102":{"estatus":"03-PM"},"103":{"estatus":"04-M"}}}
```

> `projectKey` debe ser la clave real, por ejemplo `P:P10152`; para edición múltiple se exige clave `P:`. Los IDs del ejemplo son ilustrativos y NO deben ejecutarse como una operación real. Los PATCH no devuelven datos del equipo: la Fase 2 deberá **releer inmediatamente** por GET autorizado, porque una asignación puede cambiar el alcance del usuario.

## 4. Job de calculados — IMPORTANTE antes de desplegar

`startScheduledJobs()` incorpora el nuevo job **solo si se conectó MySQL**. Comprueba la fecha CDMX cada 15 min y, a partir de las **00:10 CDMX**, ejecuta una actualización **idempotente por día e instancia**. Si se inicia el backend después de las 00:10, puede ejecutarse al arrancar. Coordina ejecuciones concurrentes con el candado nativo `GET_LOCK` de MySQL; no crea tablas. Es necesario que el proceso Azure permanezca activo (**verificar Always On/configuración real**). No se puede prometer la hora exacta ni la ejecución diaria si el servidor no está activo.

**Advertencia material:** la primera ejecución puede actualizar **muchas filas históricas** de `ins_fl`, especialmente `estatus_completo`, que estaba vacío en el respaldo del 07/10. Esto actualizará también `updated_at` por efecto normal de MySQL. **No desplegar en Azure/Aiven productivo sin respaldo verificado, revisión de datos existentes y prueba previa en ambiente restaurado.** No se ejecutó esta actualización aquí. El job registra resumen en logs técnicos; el recálculo automático nocturno no genera una interacción por cada día/equipo (la auditoría detallada corresponde a las ediciones humanas).

El cron de la aplicación no depende de variables ocultas que deshabiliten interacciones/notificaciones; no modifica sus jobs.

## 5. Instalación manual — ZIP directo, sin instalador

1. **Resguardar tu trabajo y la base antes de cualquier despliegue.** El ZIP solo debe aplicarse sobre los archivos del commit de referencia sin cambios locales en estas rutas. Ningún archivo de otros módulos debe sobrescribirse.
2. En la carpeta raíz del repo local ejecutar `git status --short`. Para los **cuatro archivos existentes**, verificar SHA Git blob del HEAD:

| Ruta | SHA Git blob requerido |
| --- | --- |
| `backend/src/bootstrap.js` | `62f23dc5b337fcaf88f7e48bc4e19130b222d315` |
| `backend/src/modules/instalaciones-administracion/instalaciones-administracion.routes.js` | `fffc7d949aea64e6a4d36c348b4d6170885deda4` |
| `backend/src/modules/instalaciones-administracion/instalaciones-administracion.tabla-service.js` | `ed747770bf82d1da34dc282781622cd5802e32a7` |
| `backend/src/modules/instalaciones-administracion/instalaciones-administracion.field-policy.js` | `c718860bb4bf5222116bbedc311854be60187601` |

Usar `git rev-parse HEAD:backend/src/bootstrap.js` (y las otras rutas) para revisar el SHA versionado; luego `git diff HEAD -- <ruta>` para garantizar que no haya cambios locales propios en cada archivo. Verificar que los **tres archivos JS nuevos** no estén creados previamente con cambios propios. **Si no coincide, detenerse y conciliar: NO usar overwrite/force a ciegas.**

3. Una vez comprobado, **extraer directamente el contenido del ZIP en la raíz** del repositorio, conservando la estructura `backend/src/...` y `backend/tests/...` (sin una carpeta FIX intermedia). En PowerShell, solo tras preflight:

```powershell
$REPO = 'C:\Users\T14s\Downloads\mantto_gestor_frontend'
$ZIP = "$env:USERPROFILE\Downloads\FIX_FASE_1_INSTALACIONES_ADMIN_V2_BACKEND_V001.zip"
Expand-Archive -LiteralPath $ZIP -DestinationPath $REPO -Force
Set-Location $REPO
node --test .\backend\tests\instalaciones-administracion-auto-v2.test.js
if ($LASTEXITCODE -ne 0) { throw 'ERROR: QA Fase 1 fallida.' }
git diff --check
git status --short
git diff --stat
```

**No ejecuta `git commit`, `git push`, despliegues, SQL ni escrituras en Aiven.** Eso se hace después del QA y solo por decisión expresa. Para revertir código, restaurar exclusivamente estos cuatro archivos a su versión anterior y retirar los tres módulos nuevos/test; antes de restaurar, guardar cambios propios. **Revertir el código NO revierte automáticamente los valores ya recalculados en `ins_fl`; se necesita respaldo de BD.**

## 6. Pruebas y estado real

- **Validación estática:** `node --check` en los 8 JS del paquete, correcto.
- **Prueba simulada (mocks, no BD real):** 37/37 pruebas con `node --test`, correcto. Casos: ocho estatus, CDMX, fecha/tipos, permisos/Visor, proyecto/scope, `expected`/409, transacción de lote, ROLLBACK al fallar auditoría, responsables y múltiples administrativos, job diario y ruta legada.
- **Verificación de origen:** cuatro SHA Git blob originales comprobados con código `main`. Ningún archivo completo reconstruido a partir de suposiciones.
- **No realizado:** instalación en Windows real del usuario, `npm test` de repo completo, conexión a Aiven, restauración de dump para escritura, pruebas E2E, deploy a Azure, GitHub Pages o Netlify.
- **Pendiente para integración:** Fase 2 oculta IDs y cambia el editor/botones por autoguardado individual, listas y calendarios; Fase 3 implementa checkboxes/botón «Deseleccionar todo» en la ubicación de «Descartar cambios» y confirmación; Fase 4 valida regresiones con Dashboard, permisos, fechas, sincronizaciones GAS y auditoría real. **El Dashboard existente todavía evalúa `fecha_liberacion_ajuste` como `SI`; su compatibilidad con fechas debe validarse antes de liberar V2 en Producción.**

**Estado de sistemas:** el ZIP se preparó fuera del repositorio. **GitHub, Azure, Aiven y Netlify no fueron modificados** por este entregable.
