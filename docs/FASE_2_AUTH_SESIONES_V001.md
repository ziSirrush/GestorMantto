# FASE 2 - Autenticacion y sesiones renovables

Base: Ult Ver 1506hrs - 0812 + FASE 1 Base Tecnica.
Fuente funcional: JIVMBLT/updated_code (espejo BLT_NOW).

## Objetivo
Incorporar el bloque de autenticacion endurecida sin activar todavia la autenticacion M2M de los SYNC.

## Archivos incluidos
- backend/src/services/auth-session.service.js (nuevo)
- backend/src/middleware/auth-rate-limit.middleware.js (nuevo)
- backend/src/middleware/auth.middleware.js
- backend/src/controllers/auth.controller.js
- backend/src/routes/auth.routes.js
- core/auth.js
- backend/sql/20260810_AUTH_SESSIONS.sql (bootstrap corregido: usuario_id BIGINT)

## Cambios funcionales
- Access JWT maximo 12 horas.
- Refresh token renovable mediante cookie HttpOnly.
- Limite por inactividad: 28 dias.
- Limite absoluto: 90 dias.
- Rotacion de refresh token y proteccion CSRF.
- Logout revoca la sesion del servidor.
- Cambio de contrasena invalida sesiones previas mediante session_version/password_changed_at.
- Rate limit para login y recuperacion.
- Primer acceso ligado al usuario autenticado; ya no recibe user_id desde frontend.
- Recuperacion usa recovery_token.
- Frontend guarda access token en sessionStorage y usa refresh para reconstruir sesion.

## Base de datos
La tabla auth_sessions de Aiven YA fue reconciliada y validada antes de esta fase.
No ejecutar DROP TABLE ni recrearla en Aiven.
El SQL incluido se conserva solo como bootstrap seguro para instalaciones nuevas y corrige usuario_id a BIGINT para coincidir con usuarios.id_SB.

## Variable M2M
Mantener en Azure:
INTEGRATION_AUTH_ENABLED=false

Esta fase NO activa HMAC para los SYNC.

## Validacion requerida despues de aplicar
1. Reiniciar backend y confirmar arranque sin errores.
2. GET /api/health => ok y database connected.
3. Login normal => 200 y acceso al portal.
4. Confirmar nueva fila en auth_sessions.
5. GET /api/auth/me autenticado => 200.
6. POST /api/auth/refresh con cookie + CSRF => 200.
7. Logout => sesion revocada.
8. Volver a iniciar sesion para continuar pruebas.
9. Validar primer acceso y recovery en una cuenta de prueba antes de produccion completa.

## Alcance
No se modifican modulos operativos, permisos, rutas SYNC ni INTEGRATION_AUTH_ENABLED.
