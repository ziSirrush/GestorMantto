# FIX V017 - Persistencia de sesion en PWA / GitHub Pages

## Objetivo
Evitar que la PWA movil obligue a iniciar sesion cada vez que se cierra y vuelve a abrir mientras el JWT vigente todavia es valido.

## Causa confirmada
`core/auth.js` guardaba `mantto_token`, `mantto_user` y `mantto_session` solamente en `sessionStorage` y, durante `init()`, eliminaba cualquier copia equivalente de `localStorage`. Al cerrar completamente una PWA movil, `sessionStorage` puede perderse. La restauracion dependia entonces exclusivamente del refresh cookie cross-site entre GitHub Pages y Azure.

## Cambio aplicado
- `sessionStorage` sigue siendo el almacenamiento activo de la sesion abierta.
- Se agrega respaldo persistente de actor en `localStorage` para `mantto_token`, `mantto_user` y `mantto_session`.
- Al reabrir la app, si `sessionStorage` esta vacio, se restaura desde el respaldo persistente.
- El JWT se revisa por su `exp` antes de restaurarse; si ya vencio, se elimina el respaldo y se intenta el refresh normal.
- Cada login, refresh, token renovado y validacion `/api/auth/me` actualiza el respaldo persistente.
- `logout()`, expiracion o invalidacion siguen ejecutando `clearSession()`, que elimina tanto `sessionStorage` como `localStorage`.
- No se modifica el Visor de usuarios: sus tokens siguen siendo de sesion y no se convierten en persistentes.

## Alcance
Archivo modificado:
- `core/auth.js`

No modifica:
- Cobranza United
- Portafolio
- sidebar / router
- backend
- Aiven
- service worker
- manifest / PWA

## Seguridad / limite temporal
Este FIX es una solucion de compatibilidad para la etapa actual con frontend en GitHub Pages y API en Azure (origen cruzado). El JWT persistente sigue teniendo la expiracion definida por backend (maximo actual: 12 horas). El backend continua validando firma, usuario y estado en `/api/auth/me`.

Para produccion definitiva sigue siendo preferible alojar frontend y API bajo el mismo sitio logico para que el refresh HttpOnly funcione sin depender de cookies third-party/cross-site.

## Validacion realizada
- `node --check core/auth.js`: OK.
- Base de `core/auth.js` verificada contra GitHub `main` antes de modificar: blob `ce30221b74b59a6de102b43c678f24c417a7af99`.
- No se incluyen archivos globales adicionales para evitar regresiones acumulativas.

## Prueba recomendada
1. Iniciar sesion en la PWA movil.
2. Cerrar completamente la PWA.
3. Reabrirla despues de 30-60 segundos.
4. Debe validar `/api/auth/me` y abrir la app sin mostrar login.
5. Pulsar `Cerrar sesion`, cerrar/reabrir y comprobar que ahora si solicita credenciales.
