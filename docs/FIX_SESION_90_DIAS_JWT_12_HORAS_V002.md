# FIX sesión 90 días y JWT 12 horas V002

Fecha: 2026-08-24  
Repositorio objetivo: `zisirrush/GestorMantto` (`main`)

## Contrato funcional

- El access JWT dura como máximo 12 horas.
- El navegador lo renueva silenciosamente cinco minutos antes de vencer para evitar una carrera con peticiones en curso.
- Si el navegador suspende temporizadores, la renovación se recupera al volver a primer plano o en la siguiente petición autenticada.
- La sesión renovable tiene un límite absoluto de 90 días. Cada rotación conserva la fecha original y no abre una ventana nueva de 90 días.
- Al llegar a esa fecha, el último JWT también vence y se exige iniciar sesión nuevamente.

## Causas corregidas

1. El frontend renovaba por actividad cada 30 minutos y no tenía un temporizador alineado con las 12 horas del JWT.
2. Los JWT no estaban limitados por `absolute_expires_at`; uno emitido cerca del día 90 podía sobrevivir hasta 12 horas adicionales.
3. Primer acceso y cambio de contraseña emitían un CSRF de sesión nuevo, pero el wrapper del frontend no lo persistía. El siguiente refresh fallaba con `SESSION_CSRF_INVALID`.
4. Web/PWA en GitHub Pages consume Auth en Azure como origen cruzado. La cookie segura ahora agrega `Partitioned` para navegadores compatibles y conserva `SameSite=None; Secure`.
5. Varias pestañas podían rotar el refresh consecutivamente. Se reutiliza el JWT más reciente compartido mientras se mantiene el lock de navegador.

## Archivos

- `backend/src/controllers/auth.controller.js`
- `backend/src/services/auth-session.service.js`
- `backend/sql/20260810_AUTH_SESSIONS.sql` (solo comentario de bootstrap)
- `backend/.env.example`
- `core/auth.js`
- `index.html` (cache-bust)

No requiere cambios de esquema ni ejecutar nuevamente el SQL de `auth_sessions`.

## Despliegue y prueba

1. Desplegar backend y frontend juntos.
2. Iniciar sesión una vez para obtener la cookie con la política nueva y un JWT ligado al vencimiento absoluto.
3. Confirmar en Network que login responde `session_absolute_expires_at` y que la cookie `mantto_refresh` tiene `HttpOnly`, `Secure`, `SameSite=None`, `Partitioned`, `Path=/api/auth` y `Max-Age` cercano a 90 días.
4. Simular un JWT próximo a vencer y comprobar `POST /api/auth/refresh` seguido del reintento transparente de la petición original.
5. Probar primer acceso y cambio de contraseña; el refresh posterior debe usar el CSRF nuevo.
6. Confirmar que `absolute_expires_at` no cambia después de varios refresh.

Para máxima compatibilidad, especialmente en navegadores que no admiten cookies particionadas, producción debe servir frontend y Auth bajo el mismo sitio lógico. GitHub Pages no procesa `_redirects`; ese archivo solo funciona en proveedores que implementan ese tipo de proxy.
