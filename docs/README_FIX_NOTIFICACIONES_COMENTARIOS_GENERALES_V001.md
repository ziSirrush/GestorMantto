# FIX_NOTIFICACIONES_COMENTARIOS_GENERALES_V001

## Objetivo
Completar la integracion del evento general `COMENTARIO` para los flujos de comentarios de Ventas que aun no llamaban al motor central de notificaciones.

## Prerrequisito de Aiven
Este FIX NO agrega SQL ni modifica esquema.

Antes de validar funcionalmente, Aiven debe tener activo `COMENTARIO` en `notificacion_eventos` y debe existir al menos una relacion activa `COMENTARIO -> Rol Principal` en `notificacion_evento_roles`. N6 usa `requireRoleMatrix=true`, por lo que sin matriz el evento queda fail-closed.

## Flujos conectados por este FIX
- Ventas > Cotizaciones: comentario nuevo.
- Ventas > Prospeccion: comentario nuevo.
- Ventas > Asignacion a Redes: comentario nuevo.

Tareas, Tickets y Solicitudes de Soporte ya estaban conectados al evento general `COMENTARIO` en N6 y no se modifican en este paquete.

Los procesos de sincronizacion/importacion de comentarios historicos NO generan notificaciones nuevas.

## Destinatarios preservados por relacion de negocio
El motor central sigue excluyendo al actor y aplica Rol Principal, politica y preferencias.

- Cotizacion: `id_asesor`, `id_admin`, `created_by` de `ventas_cotizaciones_cor`.
- Prospeccion: propietario `id_usuario` de `ventas_prospecciones`.
- Asignacion a Redes: `id_usuario_asignado` y `created_by` de `ventas_redes`.

No se amplian destinatarios por rol dentro de los modulos. El filtrado por Rol Principal se conserva en `notification.service.js`.

## Zona
Los tres flujos comerciales declaran `zonaOperativaNoAplica=true`. Sus tablas no usan la relacion `usuario_zop/z_op` del dominio operativo; Cotizaciones tiene un campo comercial `zona`, que no se interpreta como FK de Zona Operativa.

## Estabilidad
- La notificacion se emite solo DESPUES de que el comentario queda guardado correctamente.
- Un error inesperado del canal de notificaciones se registra en log y no revierte el comentario ya guardado.
- La respuesta 201 conserva el payload previo y agrega `notificaciones` con la cantidad creada.
- No se eliminan ni desactivan aun los codigos legacy `ventas.*.comentario`; se mantienen durante validacion para no introducir una migracion destructiva.

## Archivos modificados
1. `backend/src/modules/ventas-cotizaciones/ventas-cotizaciones.controller.js`
2. `backend/src/modules/ventas-prospeccion/ventas-prospeccion.controller.js`
3. `backend/src/modules/ventas-redes/ventas-redes.controller.js`

## Archivo nuevo
4. `backend/src/services/notifications/comment-notification.service.js`

## Validacion requerida despues de deploy
1. Confirmar `COMENTARIO` activo en Aiven.
2. Configurar al menos un Rol Principal para `COMENTARIO` desde Panel de Control > Notificaciones.
3. Crear comentario en Cotizacion con otro usuario relacionado y confirmar `notificaciones > 0`.
4. Repetir en Prospeccion.
5. Repetir en Asignacion a Redes.
6. Confirmar que el actor no se notifica a si mismo.
7. Confirmar que un Rol no habilitado para `COMENTARIO` no recibe la notificacion.

No puedo confirmar el comportamiento contra Aiven vivo hasta desplegar este FIX y completar la matriz `COMENTARIO -> Rol Principal`.
