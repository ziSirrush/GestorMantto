# FIX_SESION_HOME_REFRESH_CIERRE_PREMATURO_V001

Fecha: 2026-08-19
Estado: listo para prueba previa a deploy

## Objetivo
Evitar que Home cierre una sesión válida cuando el JWT de acceso vence y el refresh de sesión todavía es válido.

## Causa
`modules/home/home.js` realizaba peticiones con `fetch()` propio y, ante cualquier HTTP 401, ejecutaba `ManttoAuth.logout()` inmediatamente. Esto omitía el flujo central de `core/auth.js`, que ya implementa `401 -> refresh -> reintento -> expiración solo si el refresh falla`.

## Archivos modificados
- `core/auth.js`
  - El wrapper central `ManttoAuth.api()` conserva correctamente `FormData` sin imponer `Content-Type: application/json`.
  - Se mantiene el flujo central existente de renovación y reintento.
- `modules/home/home.js`
  - `apiRequest()` delega primero en `ManttoAuth.api()`.
  - Se elimina el logout/limpieza local directa por HTTP 401 dentro de Home.
  - El fallback aislado ya no destruye la sesión local.
- `index.html`
  - Solo cambia el cache-bust de `core/auth.js` y `modules/home/home.js` para cargar esta versión del FIX.

## No modificado
- Backend.
- SQL / Aiven.
- Duración de JWT, refresh, inactividad o límite absoluto de 90 días.
- Módulos operativos en Nevera.

## Validaciones realizadas
- `node --check core/auth.js`: OK.
- `node --check modules/home/home.js`: OK.
- `backend/npm run check`: OK.
- Simulación controlada: primera llamada protegida devuelve 401, refresh devuelve token nuevo y el reintento responde 200: OK.
- Validación `FormData`: no se fija `Content-Type` manual y se conserva el boundary del navegador: OK.
- Verificación estática: Home ya no contiene `handleInvalidSession`, `clearLocalSession` ni logout directo por `response.status === 401`: OK.

## Resultado esperado
Cuando el JWT de acceso venza durante Home o durante el polling de notificaciones, la aplicación intentará renovar la sesión mediante el flujo central. El usuario solo será enviado al login si esa renovación realmente falla o la sesión ya no es válida.
