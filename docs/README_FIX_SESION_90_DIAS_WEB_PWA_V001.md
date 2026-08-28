# FIX SESIÓN 90 DÍAS WEB + PWA V001

Base revisada: `ziSirrush/GestorMantto` · `main` · commit `f03066618a6c329eab8669f2d61a0d5b546e9c4e`.

## Qué se encontró

- El JWT de acceso conserva un máximo de 12 horas.
- El backend ya tenía refresh rotativo, pero la sesión renovable usaba 28 días de inactividad y 90 días absolutos.
- El frontend consumía Auth directamente en el dominio Azure, por lo que la cookie `mantto_refresh` dependía del comportamiento cross-site del navegador.
- Web y PWA utilizan el mismo cliente `core/auth.js`.
- El service worker actual gestiona Push y no intercepta las peticiones del API.

## Qué cambia

1. `backend/src/services/auth-session.service.js`
   - `IDLE_DAYS` pasa de 28 a 90.
   - Se conserva `ABSOLUTE_DAYS = 90`.
   - Se conserva la cookie HttpOnly, refresh token rotativo y validación CSRF.
   - El JWT de acceso continúa con su máximo actual de 12 horas; se renueva silenciosamente.

2. `core/config.js`
   - Las consultas operativas siguen usando directamente el backend Azure actual.
   - Se agrega `MANTTO_SESSION_API_BASE` para que solo Auth use el mismo origen del frontend en Web/PWA.
   - En desarrollo HTTP se conserva el backend local en puerto 3001.

3. `core/auth.js`
   - Las rutas `/api/auth/*` usan `MANTTO_SESSION_API_BASE`.
   - El resto de rutas conserva `MANTTO_API_BASE` y sigue directo a Azure.
   - Refresh y logout usan explícitamente el origen Auth.
   - No cambia la lógica funcional de login, visor, permisos del dispositivo, eventos ni almacenamiento existente.

4. `_redirects`
   - Nuevo proxy Netlify únicamente para `/api/auth/*` hacia Azure.
   - No se proxyea el resto de `/api`, evitando afectar reportes, archivos o consultas pesadas.

## Archivos modificados / nuevos

- `backend/src/services/auth-session.service.js`
- `core/config.js`
- `core/auth.js`
- `_redirects` (nuevo)
- `README_FIX_SESION_90_DIAS_WEB_PWA_V001.md` (nuevo)

## Validaciones realizadas

- `node --check backend/src/services/auth-session.service.js`
- `node --check core/config.js`
- `node --check core/auth.js`
- Verificación de que `_redirects` solo afecta `/api/auth/*`.
- Verificación de que no se modifica `auth.controller.js`, `auth.routes.js`, tablas ni estructura SQL.
- Verificación de que las llamadas operativas continúan directas al backend Azure.

## Validación requerida después del deploy

1. Desplegar backend y frontend.
2. Cerrar sesión e iniciar sesión nuevamente una vez para emitir la nueva cookie desde el origen del Gestor.
3. En Web y PWA comprobar que login y `/api/auth/refresh` se solicitan contra el dominio del frontend (`/api/auth/...`), no directamente contra Azure.
4. Confirmar que `mantto_refresh` queda asociada al dominio del frontend con `Path=/api/auth`.
5. Confirmar que una petición operativa normal continúa llamando directamente al dominio Azure.
6. Probar reapertura después de superar la vida del JWT de 12 horas y confirmar que no solicita login.

## Nota de despliegue

Las sesiones anteriores no pueden trasladar automáticamente una cookie HttpOnly del dominio Azure al dominio del frontend. Por eso, después de aplicar este FIX, cada usuario debe iniciar sesión una vez para crear la nueva sesión first-party.

Este FIX usa `_redirects`, mecanismo de rewrite/proxy de Netlify. Si el frontend cambia posteriormente a Vercel o Azure, se deberá configurar el rewrite equivalente para `/api/auth/*`.
