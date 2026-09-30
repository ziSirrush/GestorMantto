-- Registrar la notificacion general de actualizacion de un Ticket seguido.
-- Ejecutar en el esquema de Mantto antes de desplegar el backend que emite
-- TICKET_ACTUALIZADO. No modifica Tickets ni suscripciones.

INSERT INTO notificacion_eventos (
  codigo_evento, agrupacion, modulo, accion, nombre_evento, descripcion,
  prioridad_default, configurable, obligatoria, campana_default,
  push_default, correo_default, titulo_default, mensaje_default,
  icono_default, accion_destino, ruta_default, orden, activo
)
SELECT
  'TICKET_ACTUALIZADO', 'Operacion', 'Tickets', 'ACTUALIZAR_TICKET',
  'Ticket actualizado',
  'Se actualizo informacion de un Ticket de mantenimiento.',
  'MEDIA', 1, 0, 1, 1, 0,
  'Ticket actualizado', 'Se actualizo un Ticket de mantenimiento.',
  'ti ti-ticket', 'ABRIR_TICKET', NULL, 115, 1
WHERE NOT EXISTS (
  SELECT 1 FROM notificacion_eventos WHERE codigo_evento = 'TICKET_ACTUALIZADO'
);

UPDATE notificacion_eventos
SET activo = 1,
    campana_default = 1,
    push_default = 1
WHERE codigo_evento = 'TICKET_ACTUALIZADO';

-- El evento es exclusivo de Seguimiento Especial. Ningun rol puede ampliar
-- sus destinatarios por la matriz nativa.
UPDATE notificacion_evento_roles
SET activo = 0,
    updated_at = CURRENT_TIMESTAMP
WHERE codigo_evento = 'TICKET_ACTUALIZADO'
  AND activo <> 0;

SELECT codigo_evento, activo, campana_default, push_default
FROM notificacion_eventos
WHERE codigo_evento = 'TICKET_ACTUALIZADO';

SELECT COUNT(*) AS relaciones_rol_activas
FROM notificacion_evento_roles
WHERE codigo_evento = 'TICKET_ACTUALIZADO' AND activo = 1;
