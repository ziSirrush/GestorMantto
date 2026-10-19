# FIX — BLT NOW | Home > Tareas | Visibilidad de metadatos V001

**Identificación:** `[Aster | 2026-10-19 | ASTER-MG | FIX_HOME_TAREAS_META_VISIBILIDAD_V001]`  
**Proyecto:** Gestor Mantto / BLT NOW  
**Base exacta:** `ziSirrush/GestorMantto`, rama `main`, commit `6733ae1d26c80a4d88185a4133c50041a0f09c05` (`Version 101926.4`)  
**Estado:** FIX preparado y validado estáticamente en copia aislada. **No aplicado a la rama del usuario ni desplegado.**

## Problema

Las tarjetas compactas de Home > Tareas mostraban indicadores sin datos útiles: `0/0 subtareas`, `0 comentarios`, `Sin fecha` y `Sin asignar`. Adicionalmente, al carecer de asignación personal real, el frontend rellenaba *Seguimiento* con las iniciales del creador, generando una apariencia de asignación no sustentada por el campo.

## Comportamiento solicitado

- **Fecha compromiso:** aparece exclusivamente si existe una fecha ISO válida en el campo normalizado. Fecha vacía, nula o `0000-00-00` no genera indicador.
- **Seguimiento (personal) / Responsables (colaborativa):** aparece solo cuando existen iniciales asignadas. Se omiten cadenas vacías y ceros; no se sustituyen por las iniciales del creador.
- **Subtareas:** aparece si `total_subtareas > 0`, incluso si `subtareas_cerradas = 0`. Un total `0/0` se oculta.
- **Comentarios:** aparece si `total_comentarios > 0`; cero se oculta.
- **Sin metadatos:** se omite el bloque completo y se reacomoda la tarjeta para no dejar un espacio vacío en escritorio o móvil.

La tarjeta conserva título, prioridad, estado, descripción, enlaces, botón **Ver**, filtros, tipos de tarea y navegación existentes. **No se elimina, modifica ni escribe ningún dato.**

**Ejemplo de aceptación:** fecha `06/07/2026`, seguimiento `DGB`, `0/0 subtareas`, `5 comentarios` → se ven la fecha, `DGB` y `5 comentarios`; no se ve `Subtareas`.

## Archivos completos incluidos (rutas originales)

| Archivo | Motivo |
|---|---|
| `modules/home/home.js` | Ocultar indicadores sin información y evitar el valor artificial del creador como seguimiento. |
| `styles/home.css` | Reacomodo responsive cuando no existe metadata visible. |
| `index.html` | Actualizar `cache-bust` únicamente para `home.js` y `home.css`. |
| `tests/tareas-formulario-reorganizacion-v001.test.js` | Actualizar expectativa de versión de recursos. |
| `tests/tareas-vista-compacta-v001.test.js` | Actualizar expectativa de versión de recursos. |
| `tests/tareas-meta-visibilidad-v001.test.js` | Casos nuevos de regresión para vacíos, ceros y la captura de referencia. |
| `README_FIX_HOME_TAREAS_META_VISIBILIDAD_V001.md` | Este documento de alcance, validación y aplicación. |

**Sin cambios:** `backend/`, SQL, tablas, Azure, Aiven, autenticación, permisos, notificaciones, Nori, otros módulos o servicio de PWA. **No contiene archivos `.patch`, instaladores ni scripts ejecutables de instalación.**

## Pruebas ejecutadas

Sobre una copia de los archivos del artefacto de GitHub Pages del commit base, reemplazando solamente los archivos anteriores:

```powershell
node --check modules/home/home.js
node --check tests/tareas-meta-visibilidad-v001.test.js
node --test tests/tareas-meta-visibilidad-v001.test.js tests/tareas-vista-compacta-v001.test.js tests/tareas-formulario-reorganizacion-v001.test.js tests/home-rich-text.test.js
```

**Resultado:** 30/30 pruebas aprobadas; sintaxis JS aprobada. Diferencias inspeccionadas contra el código del commit indicado. `git diff --check` sin errores de espacios (validación del contenido). Pruebas E2E autenticadas y publicación en PWA/Netlify **no realizadas**.

## Aplicación local manual — PowerShell

1. Verifica que tu copia de trabajo corresponda al commit base; **detente si el commit es otro** y solicita rebase/revisión, no sobrescribas sin compararlo.
2. Confirma que no haya cambios locales pendientes en los seis archivos afectados.
3. Extrae el ZIP directamente en la raíz del repositorio, respetando la estructura de carpetas; sobrescribe únicamente los archivos contenidos en el ZIP.
4. Ejecuta las pruebas indicadas y revisa `git diff` antes de crear cualquier commit.

Ejemplo (ajusta solo la ruta de tu repositorio y del ZIP):

```powershell
$REPO = 'C:\Users\T14s\Downloads\mantto_gestor_frontend'
$ZIP = Join-Path $env:USERPROFILE 'Downloads\BLT_NOW_FIX_HOME_TAREAS_META_VISIBILIDAD_V001.zip'
Set-Location $REPO

$BASE = '6733ae1d26c80a4d88185a4133c50041a0f09c05'
if ((git rev-parse HEAD).Trim() -ne $BASE) { throw 'Commit distinto: detener y revisar el FIX.' }

$TARGETS = @('index.html','modules/home/home.js','styles/home.css',
  'tests/tareas-formulario-reorganizacion-v001.test.js',
  'tests/tareas-vista-compacta-v001.test.js',
  'tests/tareas-meta-visibilidad-v001.test.js')
if (git status --porcelain -- $TARGETS) { throw 'Existen cambios locales en archivos del FIX. Detener.' }

Expand-Archive -LiteralPath $ZIP -DestinationPath $REPO -Force
node --check modules/home/home.js
node --test tests/tareas-meta-visibilidad-v001.test.js tests/tareas-vista-compacta-v001.test.js tests/tareas-formulario-reorganizacion-v001.test.js tests/home-rich-text.test.js
if ($LASTEXITCODE -ne 0) { throw 'Pruebas fallidas: no hacer commit.' }
git diff --check
git status --short
git diff -- index.html modules/home/home.js styles/home.css
```

**Commit local, exclusivamente si ya revisaste los resultados:**

```powershell
git add index.html modules/home/home.js styles/home.css `
  tests/tareas-formulario-reorganizacion-v001.test.js `
  tests/tareas-vista-compacta-v001.test.js `
  tests/tareas-meta-visibilidad-v001.test.js `
  README_FIX_HOME_TAREAS_META_VISIBILIDAD_V001.md
git commit -m "FIX | Home Tareas | Ocultar metadatos vacios y en cero V001"
```

**No ejecutar `git push` ni desplegar en GitHub Pages/Netlify/Azure sin autorización explícita.** El `cache-bust` se activará cuando los archivos sean integrados y el frontend se vuelva a cargar; la existencia de este ZIP no implica publicación.
