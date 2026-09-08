# FIX_SEGUIMIENTO_ESPECIAL_MANTTO_V004

Baseline verificado: `fd8446d140057cf9b9ef4dc947881f501c635745` — `Version 090826.6 - Comments`.

## Objetivo

Corregir la visibilidad del acceso **Portafolio → ⭐ Seguimiento Especial** en el panel lateral.

## Causa localizada

V003 sí construía el botón lateral, pero `syncPermissionUi()` lo ocultaba cuando el snapshot frontend de permisos todavía no estaba disponible. A su vez, `refresh()` se detenía si `canAccess()` era falso, por lo que nunca consultaba al backend para confirmar el acceso. Si los eventos `mantto:auth-ready` / `mantto:permissions-updated` ya habían ocurrido antes de terminar de cargar el script, el botón podía permanecer oculto durante toda la sesión.

## Corrección

- Se mantiene el acceso lateral inmediatamente después de **Proyectos de Mantenimiento**.
- Si el snapshot frontend de permisos ya está resuelto, se respeta directamente.
- Si el snapshot todavía es desconocido, `GET /api/portafolio/seguimiento-especial` actúa como validación autoritativa.
- HTTP 200 confirma el acceso y hace visible `⭐ Seguimiento Especial`.
- HTTP 401/403 mantiene el acceso oculto.
- Al actualizar permisos, cambiar usuario en el visor o renovar autenticación, se invalida la confirmación anterior y se vuelve a resolver.
- Se incrementa el cache-bust de `seguimiento-especial-global.js` a V004.

## Archivos modificados

- `core/module-loader.js`
- `modules/seguimiento-especial/seguimiento-especial-global.js`

## Base de datos

No incluye SQL. No modifica Aiven ni la tabla `portafolio_interes`.

## Permisos

El módulo continúa respetando:

- `PORTAFOLIO_SEGUIMIENTO_ESPECIAL_ACCESO_VISUAL_MODULO.ACCESO_VISUAL`
- `PORTAFOLIO_SEGUIMIENTO_ESPECIAL_SEGUIMIENTO_PROYECTO_EQUIPO.GESTIONAR_SEGUIMIENTO`

Si el usuario no tiene ninguna de las dos facultades efectivas, el acceso lateral debe permanecer oculto.

## Validaciones realizadas

- Baseline V003 local contrastado por Git blob SHA contra `main` V090826.6:
  - `core/module-loader.js` = `c6f61d301a6556dc0c4bb5f3e180f51bd24fa5b2`
  - `modules/seguimiento-especial/seguimiento-especial-global.js` = `b6dfd4432e21bcf5d4647211016c69b04874a3ab`
- `node --check core/module-loader.js`: OK.
- `node --check modules/seguimiento-especial/seguimiento-especial-global.js`: OK.
- Validación estática del flujo 200 / 401 / 403: OK.

No se ejecutó deploy, E2E ni escritura en GitHub/Azure/Netlify/Aiven.
