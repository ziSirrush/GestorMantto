# FIX Notificaciones Push Global V001

## Alcance
Implementa notificaciones Web Push globales para las filas nuevas y no leídas de `sup_notificaciones`.

## Requisitos previos
La tabla `notificaciones_push_suscripciones` debe existir con estas columnas utilizadas por el código:

- `id_suscripcion`
- `id_usuario`
- `endpoint`
- `p256dh`
- `auth`
- `user_agent`
- `dispositivo_nombre`
- `activo`
- `ultimo_uso_at`
- `created_at`
- `updated_at`

`endpoint` debe tener una llave única para permitir UPSERT.

## Configuración
Generar claves una sola vez:

```bash
node scripts/generate-vapid-keys.js
```

Configurar en Railway:

```env
WEB_PUSH_ENABLED=true
WEB_PUSH_VAPID_PUBLIC_KEY=<publica>
WEB_PUSH_VAPID_PRIVATE_KEY=<privada>
WEB_PUSH_SUBJECT=mailto:correo-real-del-sistema@dominio.com
WEB_PUSH_DISPATCH_INTERVAL_MS=5000
```

La clave pública y privada deben permanecer iguales entre despliegues. Cambiarlas invalida las suscripciones existentes.

## Uso
Después de iniciar sesión aparece el botón `📳` junto a la campana. El usuario debe pulsarlo una vez y aceptar el permiso del navegador. Cuando queda activo cambia a `🔔`.

## Seguridad
El push no incluye título, texto ni datos de la entidad. Solo informa que existe una notificación pendiente y abre la bandeja interna autenticada.

## Archivos
- `service-worker.js`
- `core/push-notifications.js`
- `index.html`
- `backend/.env.example`
- `backend/scripts/generate-vapid-keys.js`
- `backend/src/bootstrap.js`
- `backend/src/routes/index.js`
- `backend/src/jobs/pushNotifications.job.js`
- `backend/src/modules/push-notifications/*`
- `docs/ADR-NOTIFICACIONES-PUSH-GLOBALES.md`
