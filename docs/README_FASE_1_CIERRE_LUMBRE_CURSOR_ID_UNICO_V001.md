# FASE 1 · Cierre Auditoría Lumbre · Cursor ID único

Fecha: 27/08/2026
Base exacta revisada: `b04fe8e14d2c9a57f517d8a850736360b356f0ed` — `Update Notificaciones 082726.4 - FIX URGENTE AUDITORIA LUMBRE`

## Objetivo

Cerrar el riesgo residual detectado después de FIX 1: el dispatcher ya almacenaba `ultimo_id_notificacion`, pero `listActiveSubscriptions()` seguía reconstruyendo un `cursor_id_efectivo` mediante `ultimo_uso_at/created_at` y `fecha_creacion`.

Ese cálculo temporal podía adelantar el cursor cuando una notificación nueva compartía el mismo segundo de `ultimo_uso_at`, dejando una notificación nunca enviada detrás del cursor.

## Cambio aplicado

`ultimo_id_notificacion` pasa a ser la **única autoridad de despacho Push**.

- Se elimina `cursor_id_efectivo` del SELECT de suscripciones activas.
- Se elimina del runtime el subquery legacy basado en `fecha_creacion <= ultimo_uso_at/created_at`.
- `cursorFor()` ignora cualquier propiedad legacy y usa exclusivamente `ultimo_id_notificacion`.
- Si una suscripción activa llega sin un `ultimo_id_notificacion` válido, el dispatcher **falla cerrado** para esa suscripción y no reenvía históricos desde ID 0.
- `ultimo_uso_at` se conserva para operación/auditoría y orden del job, pero ya no define la frontera de notificaciones.

No se modifica el watermark, paginación, límite por ciclo, preferencias, matriz Evento/Rol, alcance, VAPID, Service Worker ni frontend.

## Precondición verificada

La SABANA actualizada entregada después de FIX 1 confirmó que las 28 suscripciones activas tenían `ultimo_id_notificacion` no nulo. Por ello ya no es necesaria una transición runtime basada en fecha.

## Archivos modificados

- `backend/src/jobs/pushNotifications.job.js`
- `backend/src/modules/push-notifications/push-notifications.repository.js`
- `validation/push-cursor-id-authority.test.js` (nueva prueba focalizada)

No incluye SQL y no requiere cambio de esquema.

## Casos validados

La validación combinada quedó en **14/14 PASS**: 10/10 de la suite FIX 1 ya existente + 4/4 pruebas nuevas de autoridad del cursor, incluyendo:

- 45 pendientes -> 20 + 20 + 5 sin pérdida.
- 100 pendientes -> 5 lotes de 20.
- 25 notificaciones con la misma fecha/hora.
- fallo temporal en ID 17 y reanudación desde 17.
- respuesta 410 conservando progreso previo.
- notificación creada después del watermark.
- ausencia de filas elegibles.
- límites inválidos de configuración.
- `ultimo_id_notificacion=100` frente a un cursor legacy simulado en 999 -> autoridad = 100.
- notificación ID 101 del mismo segundo no se pierde aunque el cursor legacy simulado diga 101.
- suscripción sin cursor ID válido -> falla cerrada, cero envíos y cero avance.
- repository sin reconstrucción temporal del cursor.

También se validó sintaxis con `node --check` de los dos archivos productivos y de la nueva prueba.

## Orden de aplicación

1. Sustituir los tres archivos incluidos conservando las rutas.
2. Ejecutar la regresión existente:
   `node --test validation/push-cursor-id.test.js`
3. Ejecutar la prueba nueva:
   `node --test validation/push-cursor-id-authority.test.js`
4. Confirmar 10/10 + 4/4 PASS.
5. Desplegar backend al entorno de validación autorizado.
6. Observar al menos un ciclo del job Push.
7. Continuar con la Fase 2 de cierre Lumbre (backup UTF8MB4).

## Reversión

Revertir únicamente estos tres archivos al commit base `b04fe8e14d2c9a57f517d8a850736360b356f0ed`.

No ejecutar ningún rollback SQL: esta fase no modifica Aiven.

## Sistemas modificados al generar esta entrega

Ninguno.

- GitHub: no modificado.
- Aiven: no modificado.
- Azure: no desplegado.
- GitHub Pages: no desplegado.
- Netlify: no modificado.
