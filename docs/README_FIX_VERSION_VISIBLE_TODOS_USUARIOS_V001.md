# FIX - Versión visible para todos los usuarios V001

Fecha: 19/08/2026

## Base utilizada

Este FIX está preparado para aplicarse DESPUÉS de:

`FIX_PERMISOS_ALCANCE_GLOBAL_FALLBACK_V001`

El `index.html` incluido parte del `index.html` de ese FIX pendiente, no de una versión anterior del repositorio. Se verificó que conserva PM&M y Documentación Pendiente en sidebar, vistas y referencias JS/CSS.

## Causa

El indicador `#app-build-version` ya existe en la barra contextual, pero `core/build-info.js` lo ocultaba para usuarios que no fueran Programador o Director General.

## Cambios

- La versión técnica queda visible para todos los usuarios autenticados.
- No depende de rol, empresa, permiso ni Alcance de Información.
- El texto queda como `Versión · <proveedor/entorno> · <mensaje> · <commit corto>` cuando el metadata de deploy está disponible.
- En localhost se conserva `Versión · LOCAL · <versión local>`.
- El tooltip conserva el commit completo cuando el despliegue lo proporciona.
- Se conserva `initProgrammerBanner()` para compatibilidad con `core/app.js`.
- Se agrega `initBanner()` como alias general para migración futura.
- `index.html` cambia únicamente el cache-bust de `core/build-info.js` a `20260819-version-visible-todos-v001` respecto del FIX de Alcance pendiente.

## Archivos modificados

- `core/build-info.js`
- `index.html`

## No modificado

- `core/app.js`
- `core/router.js`
- backend
- permisos
- tablas
- módulos de Instalaciones

## Validaciones

- Base `core/build-info.js` coincide con el blob vigente de `main` antes del cambio: `746e15b87e3cfd7ad1d83a22318aa063e7910198`.
- `node --check core/build-info.js` correcto.
- No queda lógica de roles que oculte la versión.
- `initProgrammerBanner()` sigue disponible para la llamada existente desde `core/app.js`.
- `index.html` conserva `instalaciones-pmm` y `instalaciones-documentacion` en sidebar y vistas.
- `index.html` conserva las referencias a los JS de PM&M y Documentación Pendiente.
- Se modificó una sola referencia de cache-bust: `core/build-info.js`.

## Orden de aplicación

1. Aplicar `FIX_PERMISOS_ALCANCE_GLOBAL_FALLBACK_V001`.
2. Aplicar este `FIX_VERSION_VISIBLE_TODOS_USUARIOS_V001`.
3. Deploy del frontend.
4. Validar con un usuario no Programador que la versión aparezca en la barra contextual.
