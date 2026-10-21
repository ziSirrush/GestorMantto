# BLT NOW — FIX V001: cliente HTTP inmutable y validación de sesión

**Código base verificado:** `ziSirrush/GestorMantto`, rama `main`, commit `cdf1ffe4e65c0359df56ba937731eb0931192d62` (Versión 102026.13).  
**Alcance:** frontend/PWA. **No** modifica backend, SQL, permisos, GAS, Aiven ni servicios de Azure.

## Diagnóstico

1. `core/http.js` publica `window.ManttoHttp = Object.freeze(...)`.
2. `offline-resumen-dia.js` y `offline-instalaciones-proyectos.js` intentaban asignar `http.get = ...` y `http.request = ...` y generaban `TypeError: Cannot assign to read only property` durante el arranque. El GET offline ya pasa por la interceptación controlada de `window.fetch`, que usan `ManttoAuth.api` y `ManttoHttp`.
3. Las solicitudes `/api/auth/me` y `/api/auth/refresh` y la espera de Web Locks no tenían un plazo de finalización específico, pudiendo dejar la pantalla «Validando sesión...» cuando una petición quedaba pendiente.
4. **Incidente independiente aún abierto:** los logs de Azure del 21/oct UTC confirman `ER_CON_COUNT_ERROR` (1040) incluso con `effective_connection_limit:2`. **Este FIX no aumenta `max_connections`, no libera conexiones externas ni recupera Aiven**.

## Cambios

- Los dos adaptadores respetan `Object.freeze(ManttoHttp)`. Mantienen el puente `fetch` y la seguridad de lectura por permisos, dominio y firma. Si el cliente es mutable (pruebas/compatibilidad previa), conserva el puente heredado.
- Un límite de **12 segundos** para `fetch` de `/api/auth/me` y `/api/auth/refresh`, y la adquisición de Web Locks de refresh; después se aplica la política actual de errores transitorios. No borra la sesión local por fallas 503; tampoco convierte una sesión 401 en válida.
- Se actualizan referencias de carga y versión de caché PWA `20261021-offline-http-session-v001`; se conserva `core/http.js` **sin modificar**.
- Se añaden pruebas de regresión con cliente realmente congelado y escenarios de sesiones pendientes.

## Archivos completos incluidos (rutas de repositorio)

**Aplicación:**

- `core/offline-resumen-dia.js`
- `core/offline-instalaciones-proyectos.js`
- `core/auth.js`
- `core/offline-navigation.js`
- `core/offline-scheduler.js`
- `service-worker.js`
- `index.html`

**Pruebas:**

- `tests/fix_offline_http_session_v001.test.js` (nueva)
- `tests/pwa-app-update.test.js` (expectativa de versión actualizada)
- `tests/offline-navegacion-fase4-acciones.test.js` (expectativa de versión actualizada)

## Integración LOCAL y verificación

1. Verifica que tu repositorio local parte del commit exacto `cdf1ffe4e65c0359df56ba937731eb0931192d62` y que los archivos de destino no tienen modificaciones locales que deban conservarse. Si difiere el commit, **detente y reconcilia**, sin sobrescribir versiones posteriores.
2. Haz respaldo de los archivos existentes. Extrae el ZIP y copia **los archivos completos conservando exactamente las carpetas** a la raíz local del repositorio.
3. Desde PowerShell, ya en la raíz local, revisa:

```powershell
git rev-parse HEAD
git status --short
git diff --check
node --check core/auth.js
node --check core/offline-resumen-dia.js
node --check core/offline-instalaciones-proyectos.js
node --check core/offline-navigation.js
node --check core/offline-scheduler.js
node --check service-worker.js
node --test tests/fix_offline_http_session_v001.test.js tests/offline-navegacion-fase1.test.js tests/offline-navegacion-fase2-resumen.test.js tests/offline-navegacion-fase3-instalaciones.test.js tests/offline-navegacion-fase4-acciones.test.js tests/auth-fresh-login-message.test.js tests/pwa-app-update.test.js
git diff --stat
```

4. Valida localmente (con y sin internet) que Resumen del Día e Instalaciones no lancen TypeError, que la solicitud de login termine ante timeout, que no haya datos de otros dominios y que las escrituras offline sigan bloqueadas. No conviertas una prueba simulada en E2E.
5. La promoción posterior requiere autorización: **Local → GitHub Pages → Netlify (manual)**. Antes del despliegue público confirma por separado la salud real de Aiven.

**Reversión LOCAL:** restaura los 7 archivos de aplicación y los 2 tests modificados desde el respaldo previo, elimina únicamente la prueba nueva si no existía y verifica con `git diff`/`node --test`. No se incluye ningún script ejecutable ni `.patch`.

## Validación realizada

- **92/92 pruebas Node.js simuladas**: 11 nuevas + 81 regresiones frontend (offline, autenticación inicial, PWA). Los mocks no sustituyen Aiven real.
- `node --check` satisfactorio en archivos JS modificados y pruebas.
- Comparación contra GitHub `main` del commit base: modificaciones restringidas a los 7 archivos de aplicación, dos tests actualizados y un test nuevo.
- ZIP y SHA-256 comprobados; listado en `SHA256SUMS_FIX_BLTNOW_OFFLINE_SESION_V001.txt`.
- **No ejecutado:** prueba con MySQL Aiven, prueba E2E en navegador real, despliegue a Netlify ni a Azure.

**Estado operativo al generar el FIX:** GitHub/Aiven/Azure/Netlify permanecen intactos por esta entrega. Mientras exista MySQL 1040, pueden continuar errores HTTP 503 aunque desaparezcan los TypeError y el spinner quede acotado.
