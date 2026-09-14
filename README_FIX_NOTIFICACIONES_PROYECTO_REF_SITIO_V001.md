# FIX_NOTIFICACIONES_PROYECTO_REF_SITIO_V001

## Objetivo
Eliminar el No. de Equipo de la presentacion visible de notificaciones UNITED y mostrar `Proyecto - Ref en sitio`.

## Regla
- Titulo: nombre del evento.
- Cuerpo: conserva la semantica del evento y usa `Proyecto - Ref en sitio` como identificador visible.
- `numero_equipo` NO se elimina del sistema: sigue disponible internamente para alcance, routing, criticidad, seguimiento y deduplicacion.
- Si falta Proyecto o Ref en sitio, se muestra el dato disponible; nunca se usa No. de Equipo como fallback visible.

## Cobertura
- Eventos criticos de Ticket: Persona atrapada, Falla en equipo critico, Nuevo equipo critico y combinaciones.
- Eventos nativos de Ticket: creacion, estatus, prioridad, responsabilidad y asignacion.
- Comentarios y Vo.Bo. de Ticket.
- Eventos nativos de Portafolio: ingreso, salida y cambio.
- Notificaciones de actividad/Seguimiento Especial por equipo de interes.

## Ejemplo validado
Entrada:
- Ticket: `254027`
- No. equipo interno: `11061-MEX-ELE-BLT`
- Proyecto: `Neuchatel`
- Ref en sitio: `Equipo`

Salida visible:
- Titulo: `Falla en equipo critico`
- Mensaje: `Se genero el ticket 254027 sobre Neuchatel - Equipo.`

El No. de Equipo permanece solo en contexto interno y no se muestra en titulo/mensaje.

## Archivos
- `backend/src/services/notifications/notification-site-label.service.js` (nuevo)
- `backend/src/services/notifications/ticket-critical-notifications_uni.service.js`
- `backend/src/services/notifications/portafolio-native-notifications_uni.service.js`
- `backend/src/services/notifications/portafolio-interest-notifications_uni.service.js`
- `backend/src/modules/tickets/tickets-notification-writes.service.js`
- `validation/seguimiento-especial-notificaciones.test.js`

## No modifica
- SQL ni tablas.
- Sync de Tickets.
- Destinatarios o matriz de roles.
- Permisos o alcance UNITED.
- Rutas de apertura.
- Logica de criticidad.
- Frontend.

## Validacion
- `node --check`: 6/6 archivos OK.
- `npm run check`: PASS.
- `npm test`: 39/39 PASS en el estado integrado con los fixes QA previos.
- Prueba dirigida del evento `FALLA_EQUIPO_CRITICO`: PASS con el ejemplo `Neuchatel - Equipo` y sin exponer `11061-MEX-ELE-BLT`.
