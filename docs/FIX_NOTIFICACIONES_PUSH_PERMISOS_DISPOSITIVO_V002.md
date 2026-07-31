# FIX Notificaciones Push y permisos por dispositivo V002

## Alcance
Implementación acumulativa de Web Push global y validación obligatoria de GPS, cámara, micrófono y Push después de un login válido.

## Flujo
1. La backend valida credenciales y emite el JWT.
2. El navegador obtiene o crea `mantto_device_token`.
3. Se muestra la pantalla de permisos antes de Home.
4. El usuario pulsa `Autorizar y continuar`.
5. Se solicitan GPS, cámara, micrófono y Push.
6. Cada resultado se sincroniza con Aiven.
7. Solo con los cuatro estados `PERMITIDO` se muestra la aplicación.

## Tablas
- `sistema_permisos_dispositivo`.
- `usuarios_dispositivos`.
- `notificaciones_push_suscripciones` incorpora `id_dispositivo`.

## Advertencias
- Ejecutar el SQL una sola vez antes de desplegar la backend.
- Producción debe usar HTTPS.
- Las claves VAPID deben estar configuradas; si Push no está disponible, el acceso queda bloqueado porque los cuatro permisos son obligatorios.
- El permiso real lo controla el navegador; Aiven registra el último estado conocido.

## Validaciones sugeridas
- Login en navegador nuevo: solicita los cuatro permisos.
- Segundo login en el mismo navegador: valida los permisos existentes sin crear otro dispositivo.
- Login en otro dispositivo/perfil: genera otro token y solicita permisos.
- Revocar un permiso y volver a iniciar sesión: bloquea Home hasta corregirlo.
- Confirmar que cámara y micrófono liberan inmediatamente sus streams.
