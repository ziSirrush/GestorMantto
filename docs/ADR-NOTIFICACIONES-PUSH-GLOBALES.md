# ADR — Notificaciones Web Push globales

## Estado
Aprobado para pruebas.

## Contexto
La campana interna depende de que la aplicación esté abierta. Se requiere avisar a los responsables incluso cuando la pestaña está en segundo plano o la PWA está cerrada.

## Decisión
Se implementa Web Push como servicio global complementario al polling interno de 10 segundos.

- El navegador registra una suscripción por usuario y dispositivo.
- La suscripción se guarda en `notificaciones_push_suscripciones`.
- Un job backend revisa nuevas filas no leídas de `sup_notificaciones` cada 5 segundos.
- El envío push no contiene datos operativos: muestra un aviso genérico y abre la bandeja de notificaciones. Esto evita exponer información sensible en proveedores push y elimina la necesidad de cifrar payloads.
- `ultimo_uso_at` funciona como cursor de entrega por suscripción.
- Una falla push no bloquea la creación ni lectura de la notificación interna.
- Endpoints 404/410 se desactivan automáticamente.

## Consecuencias
- Requiere HTTPS, Service Worker y permiso explícito del usuario.
- Requiere claves VAPID configuradas en Railway.
- El polling interno sigue siendo respaldo cuando el push está bloqueado o no disponible.
