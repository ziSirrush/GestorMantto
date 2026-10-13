# FASE 2 — Instalaciones · Administración — Edición fantasma por celda

**Fecha:** 13/10/2026  
**Identificador:** `FIX_FASE_2_INSTALACIONES_ADMINISTRACION_EDICION_FANTASMA_V001`  
**Base oficial consultada:** repositorio `ziSirrush/GestorMantto`, `main` → `c344f4cddb6b7fa4dd7be3eaabb7357edcc2b76e` (Version 100926.5, 09/10/2026).  
**Prerrequisito obligatorio:** haber aplicado **Fase 1 V001** exactamente sobre esa base. Este instalador reconstruye temporalmente la Fase 1 desde el commit local y compara SHA-256 de sus seis archivos para evitar parches sobre versiones distintas.  
**Estado:** ZIP incremental, **NO aplicado a ningún repositorio o ambiente**. Las pruebas contra Aiven/Azure y E2E del navegador quedan pendientes.

## 1. Alcance autorizado

**Main de Instalaciones → Administración: INTACTO.** Al seleccionar un proyecto permanece la tabla secundaria de Fase 1 con todas las columnas autorizadas de `ins_fl` y solo los equipos del proyecto y alcance del usuario.

**Fase 2 añade exclusivamente edición fantasma local:**

- Un botón accesible en cada celda **operativa editable y autorizada** permite abrir un editor contextual sin navegar a la antigua ficha individual. Campos técnicos (`id_ins_fl`, `created_at`, `updated_at`), grupos sin `EDITAR` y el modo Visor quedan en solo lectura.
- El usuario modifica el valor, pulsa **Aplicar borrador** y puede ver el valor provisional junto al valor **Original**. El cambio visual se distingue por color y el contador muestra borradores pendientes.
- **Revertir borrador** revierte un campo; **Descartar borradores** elimina todos los borradores de ese proyecto.
- Los borradores se conservan **entre las páginas** de la misma tabla (30 equipos por página). Se descartan al cambiar de proyecto, volver a Main, actualizar con confirmación, salir del módulo o cambiar actor/usuario/visor/permisos.
- Si al refrescar la fila el valor original cambió, la celda muestra advertencia de conflicto. El helper evita reemplazar automáticamente el `original` guardado en memoria.
- Los valores se capturan en memoria JavaScript del navegador. **No se usa Aiven, API de escritura, localStorage, sessionStorage, IndexedDB, ni se hace persistencia.** Cerrar o recargar la pestaña elimina los borradores.
- Campos tipo texto, multilínea, fecha, porcentaje, importe, booleano o usuario aprovechan las reglas y catálogos existentes. Para un campo `usuario` se usa el catálogo **GET** autorizado actualmente; no se inventan responsables.
- El helper no habilita funcionalidades por rol textual ni amplía permisos. Continúan vigentes **Sesión + Permiso funcional + Puerta CORELLIAN + Alcance de registro**, aplicados por el backend de Fase 1.

**Fuera de alcance:** Guardar en Aiven, PATCH/POST nuevo, transacciones, auditoría nueva y botón Guardar definitivo. **Todo esto queda para la Fase 3**. Los endpoints históricos de edición de la implementación previa **siguen existiendo pero la tabla no los invoca**.

## 2. Archivos del FIX

Los **tres archivos preexistentes**, generados completos por el instalador a partir de la Fase 1 verificada, son:

1. `modules/instalaciones-administracion/instalaciones-administracion_cor.js` — inyección del editor, render de tabla editable localmente, descarte por navegación/sesión.
2. `core/module-loader.js` — carga secuencial y cache bust del helper, CSS y módulo actualizados.
3. `index.html` — únicamente cache bust de `core/module-loader.js`; **no se altera el contenido de Main**.

Los **dos archivos nuevos y completos**, con rutas del repositorio, son:

4. `modules/instalaciones-administracion/instalaciones-administracion-ghost_cor.js` — motor aislado de borradores locales, editor, validación previa, reversión, permisos UI.
5. `modules/instalaciones-administracion/instalaciones-administracion-ghost_cor.css` — estilos solo para la tabla secundaria (`#iadm-cor-project`).

Los demás archivos del ZIP son **auxiliares no instalados en el repo:** instalador, referencias idénticas de Fase 1 para su verificación, 2 pruebas, manifiesto y SHA-256. **No se modifica ningún archivo backend ni tabla SQL.**

### Por qué se incluye un instalador en lugar de copias del JS grande

El conector permitió revisar `main`, pero el contenedor no tiene acceso de red directo para descargar los archivos completos del repositorio. Para evitar entregar versiones truncadas o incompatibles, el instalador **reconstruye temporalmente** Fase 1 con archivos provenientes de `git show`, verifica **SHA-256 de los seis archivos** y aplica cambios únicamente a los tres archivos preexistentes. Produce archivos completos en la copia local; si encuentra diferencias, falla cerrado **antes de modificar el repositorio**. La restricción y el procedimiento son equivalentes al enfoque de la entrega de Fase 1.

## 3. Instalación — PowerShell en Windows

**Requisitos:** Node.js y Git instalados; la carpeta del repositorio conserva el historial con commit `c344f4c`; **Fase 1 aplicada y sin cambios adicionales en sus seis archivos**. No es necesario conectarse a Aiven para aplicar Fase 2.

Descomprime el ZIP para obtener la carpeta `FIX_FASE_2_INSTALACIONES_ADMINISTRACION_EDICION_FANTASMA_V001`. Ajusta `REPO` a tu ruta real:

```powershell
$REPO = 'C:\Users\T14s\Downloads\mantto_gestor_frontend'
$FIX  = "$env:USERPROFILE\Downloads\FIX_FASE_2_INSTALACIONES_ADMINISTRACION_EDICION_FANTASMA_V001"

node --test "$FIX\tests\instalaciones-admin-ghost.test.js" "$FIX\tests\instalaciones-admin-fase2-installer.test.js"
if ($LASTEXITCODE -ne 0) { throw 'Pruebas de Fase 2 fallaron.' }

node "$FIX\installer\aplicar-fase2.js" "$REPO" --check
if ($LASTEXITCODE -ne 0) { throw 'Preflight Fase 2 rechazado: NO aplicar.' }

node "$FIX\installer\aplicar-fase2.js" "$REPO" --apply
if ($LASTEXITCODE -ne 0) { throw 'Instalacion de Fase 2 fallida.' }

Set-Location $REPO
git diff --check
git status --short
git diff -- modules/instalaciones-administracion/instalaciones-administracion_cor.js core/module-loader.js index.html
```

**Importante:** El paso `--check` es **de solo lectura sobre tu repositorio**. Para calcular las firmas recrea la Fase 1 dentro de una carpeta temporal y la borra. El `--apply` solo reemplaza los tres archivos indicados y agrega dos nuevos; intenta revertirlos si una escritura local falla. No ejecuta `git add`, `commit`, `push`, `reset --hard`, `deploy` ni conexiones a API/Aiven.

## 4. QA recomendado antes de Fase 3

1. **Main intacto:** búsqueda/filtros/paginación de proyectos, botón Actualizar y acciones previas.
2. **Proyecto real con múltiples equipos:** tabla muestra exactamente los equipos de su PP NS autorizados (incluidas varias páginas) y todas las columnas visibles.
3. **Usuario EDITAR + ACCESO_VISUAL:** editar texto, fecha, porcentaje, costo, responsable, booleano; comprobar original/valor provisional y reversión, sin entrada de Aiven ni auditoría.
4. **Solo lectura, Visor y fuera de alcance:** sin editores; ninguna consulta a proyectos ajenos; sin errores visuales ni filtraciones.
5. **Navegación:** borradores por varias páginas, confirmar descarte al volver a Main o al actualizar. Verificar cambio de sesión y visor; no conservar borradores de otro usuario.
6. **Integridad:** inspeccionar Network: **sin PATCH/POST/PUT/DELETE provocados por el editor fantasma**. Las lecturas GET existentes son válidas.
7. **Concurrencia y datos heredados:** observar avisos cuando `original` es distinto del dato reconsultado, y evitar escribir sobre valores no representables sin intervención explícita.
8. **PWA/Cache:** validar nueva versión de loader y CSS en Local y GitHub Pages; producción Netlify requiere despliegue manual autorizado.

**Pruebas realizadas al generar este ZIP:** 7 pruebas unitarias/simuladas de helper y transformaciones (Node); sintaxis JS revisada; sin acceso a checkout real de Git en el contenedor; el `--check` oficial sobre tu repositorio y el E2E siguen pendientes. No hay mediciones de rendimiento contra Aiven.

## 5. Reversión controlada

Revertir únicamente **los tres archivos de Fase 2** a sus versiones inmediatamente posteriores a Fase 1 y eliminar los **dos nuevos** de Fase 2, siempre después de revisar cambios propios. Como `core/module-loader.js` e `index.html` ya estaban modificados por Fase 1, **no restablecerlos directamente a `HEAD` sin evaluar el diff**: ello también perdería la carga de la tabla de Fase 1. No se requiere rollback SQL.

## 6. Estado real

- GitHub `ziSirrush/GestorMantto`: **NO modificado**.
- Aiven MySQL: **NO modificado**.
- Azure App Service: **NO modificado**.
- Netlify: **NO modificado**.
- El ZIP queda listo para prueba local, condicionado al preflight contra una copia del repositorio con Fase 1 aplicada.
