# FIX Permisos opcionales con recordatorio de 24 horas V004

## Problema
El asistente permitía activar cada permiso por separado, pero mantenía bloqueado el botón Continuar hasta autorizar GPS, cámara, micrófono y Push. Esto impedía entrar cuando un permiso tardaba, estaba bloqueado o no estaba disponible.

## Corrección
- Cada permiso conserva su botón individual.
- `Continuar` queda disponible aunque ninguno esté autorizado.
- Al continuar, se sincroniza en Aiven el estado real conocido del dispositivo.
- Los permisos pendientes no se marcan falsamente como permitidos.
- El sistema vuelve a mostrar el recordatorio después de 24 horas en ese navegador/dispositivo.
- Si los cuatro permisos ya están permitidos, no se muestra el asistente.
- La identificación continúa realizándose mediante `device_token`.

## Importante
Este FIX deja de bloquear el acceso general por permisos pendientes. Las funciones que necesiten GPS, cámara, micrófono o Push deben validar su permiso al ejecutarse y bloquear solamente esa función cuando corresponda.

## Archivos modificados
- `core/device-permissions.js`
- `styles/device-permissions.css`

## Orden de aplicación
Aplicar después de:
1. `FIX_NOTIFICACIONES_PUSH_PERMISOS_DISPOSITIVO_V002`
2. `FIX_LOGIN_PERMISOS_VALIDANDO_SESION_V002`
3. `FIX_PERMISOS_INDIVIDUALES_DISPOSITIVO_V003`
