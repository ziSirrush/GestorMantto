# HOTFIX AUTH GITHUB PAGES V001

Fecha: 2026-08-20
Repositorio: `ziSirrush/GestorMantto`
Base verificada: `main`, commit `731217290608fd064bde9de68813007d110474ed`.

## Causa confirmada

El FIX de sesión de 90 días configuró `MANTTO_SESSION_API_BASE` con `window.location.origin` para producción HTTPS y agregó `_redirects` como proxy de `/api/auth/*` hacia Azure.

Eso funciona en Netlify, pero el frontend actual está publicado en GitHub Pages (`https://zisirrush.github.io/GestorMantto/`). GitHub Pages no ejecuta `_redirects`, por lo que Auth terminaba solicitando:

`https://zisirrush.github.io/api/auth/login`

Esa ruta no existe y bloquea el inicio de sesión.

## Cambio

Solo se modifica:

- `core/config.js`

Comportamiento nuevo:

- Web/PWA publicadas: Auth vuelve a `https://mantto-gestor-api-a4hwfpgvbeb4gmgj.mexicocentral-01.azurewebsites.net`.
- Consultas operativas continúan en Azure, como antes.
- Desarrollo local mantiene `http://localhost:3001` o `http://127.0.0.1:3001`.

## No modificado

- No se modifica `core/auth.js`.
- No se modifica el backend de sesiones.
- Se conserva el cambio de duración 90 días ya aplicado en backend.
- No se modifica el FIX de Reporte Instalaciones / llave maestra.
- No SQL.
- No tablas.
- No rutas backend.

## Validación

- `node --check core/config.js`: OK.
- Se verificó que en `zisirrush.github.io` el destino Auth resuelto sea Azure.
- Se verificó que en `localhost` el destino Auth resuelto sea `:3001`.

## Después del deploy

1. Publicar el archivo `core/config.js`.
2. Hacer recarga forzada en Web (`Ctrl+F5`).
3. En PWA cerrarla completamente y abrirla de nuevo; si mantiene el JS anterior, borrar caché del sitio o reinstalar la PWA.
4. En Network confirmar que `/api/auth/login` apunte a Azure y no a `zisirrush.github.io`.

## Nota sobre los 90 días

Este hotfix recupera el acceso. GitHub Pages no puede ofrecer el proxy first-party planteado por `_redirects`; por eso la persistencia real de refresh durante 90 días debe validarse por separado con la cookie cross-site del navegador o resolverse con una arquitectura compatible con GitHub Pages. No se afirma que este hotfix, por sí solo, garantice 90 días en todos los navegadores.
