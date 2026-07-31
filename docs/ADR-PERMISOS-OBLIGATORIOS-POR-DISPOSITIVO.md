# ADR — Permisos obligatorios por dispositivo

## Estado
Aprobado para pruebas.

## Decisión
Mantto Gestor identifica cada instalación del navegador con un `device_token` aleatorio de 64 caracteres almacenado en `localStorage`.

Después de validar correctamente la sesión, la aplicación comprueba y solicita cuatro permisos obligatorios:

- GPS.
- Cámara.
- Micrófono.
- Notificaciones push.

El usuario no entra a Home hasta que los cuatro estén permitidos en el dispositivo actual.

## Fuente de verdad
El navegador conserva la autorización real. Aiven guarda el último estado verificado por usuario y dispositivo para auditoría y comparación.

## Seguridad y privacidad
El token no se genera mediante fingerprinting, IP, resolución ni datos de hardware. Es un identificador aleatorio local.

## Consecuencias
- Un navegador o perfil nuevo genera otro token y solicita permisos nuevamente.
- Revocar un permiso provoca que se solicite o bloquee el acceso en el siguiente inicio de sesión.
- Un equipo sin cámara, micrófono, geolocalización o soporte Push no podrá entrar mientras los cuatro requisitos estén activos.
