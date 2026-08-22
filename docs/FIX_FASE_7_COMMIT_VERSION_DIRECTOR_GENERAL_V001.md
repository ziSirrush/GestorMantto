# FIX FASE 7 — Commit / versión visible para Director General V001

Fecha: 17/08/2026

## Objetivo
Permitir que el rol exacto `Director General` consulte en la barra contextual la misma información técnica de versión/commit que actualmente ve el rol exacto `Programador`.

## Diagnóstico confirmado
- `core/build-info.js` controla la visibilidad del indicador `#app-build-version`.
- La implementación vigente únicamente aceptaba el rol exacto `Programador`.
- La metadata del commit sigue viniendo de `window.MANTTO_BUILD_INFO`; este FIX no consulta GitHub desde el navegador y no agrega endpoints ni polling.
- Mi Perfil conserva su comportamiento existente y sigue mostrando la versión mediante `getProfileLabel()`.

## Cambio
El indicador técnico de la barra contextual queda visible únicamente para:
- `Programador`
- `Director General`

Se mantienen explícitamente fuera por no formar parte de este requerimiento:
- `Programador United`
- `Programador Corellian`
- cualquier otro rol

La detección considera las mismas fuentes de rol ya utilizadas por el componente: `user.rol`, `user.roles` y `user.roles_detalle`.

## Archivos modificados
- `core/build-info.js`
- `index.html` — únicamente se actualiza el query de versión de `core/build-info.js` para evitar servir el JS anterior desde caché.

`index.html` parte de la Fase 1 acumulativa para conservar la integración restaurada de `ventas-cotizaciones-editar`.

## No modifica
- Backend / API.
- Aiven / SQL.
- Permisos de Programador.
- Panel de Control.
- Visor de usuarios.
- Herramientas de desarrollo.
- Despliegues ni workflows.
- `Programador United` / `Programador Corellian`.
- Lógica `_uni` o `_cor` de negocio.

## Validaciones
- `node --check core/build-info.js`.
- Programador: indicador visible.
- Director General como rol principal: indicador visible.
- Director General dentro de `roles_detalle`: indicador visible.
- Programador United: indicador oculto.
- Programador Corellian: indicador oculto.
- Usuario sin rol autorizado: indicador oculto.
- El cambio de `index.html` respecto a la Fase 1 es únicamente el cache-bust de `core/build-info.js`.
- Se conservan los assets JS/CSS de `ventas-cotizaciones-editar` restaurados en Fase 1.

## Deploy
Requiere publicación del frontend. No requiere redeploy de backend ni SQL.
