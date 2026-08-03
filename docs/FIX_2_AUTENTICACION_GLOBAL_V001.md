# FIX 2 - Autenticacion global V001

## Objetivo
Corregir sesiones locales inconsistentes cuando el backend responde `401 Unauthorized` después de que el usuario ya inició sesión.

## Archivos modificados
- `core/auth.js`
- `index.html`

## Cambios
- Intercepta respuestas `401` en peticiones protegidas realizadas mediante `ManttoAuth.api`, `apiGet` y `apiPost`.
- Limpia token, usuario actor, usuario del visor y metadatos de sesión.
- Regresa a la pantalla de inicio de sesión.
- Emite el evento global `mantto:session-expired` para que otros módulos puedan cerrar modales o procesos activos.
- Conserva el mensaje técnico en el objeto de error mediante `status`, `code` y `payload`.
- Excluye login, preguntas de seguridad y recuperación de contraseña, evitando interpretar credenciales incorrectas como una sesión expirada.
- Añade `X-Device-Token` también a las peticiones realizadas por `ManttoAuth.api`, alineándolas con `authHeaders()`.
- Actualiza el cache-buster de `core/auth.js`.
- Conserva en `index.html` el cache-buster de Push incluido en el FIX 1.

## Comportamiento esperado
1. Si el JWT vence o es rechazado, la sesión local se elimina automáticamente.
2. Si el usuario fue desactivado, se solicita iniciar sesión nuevamente.
3. Un `403 Forbidden` no cierra la sesión; permanece disponible para el manejo formal de permisos.
4. Una contraseña incorrecta en `/api/auth/login` muestra el error recibido sin activar el cierre global.

## Validacion
- `node --check core/auth.js`
- Verificación de archivos incluidos en el ZIP.
