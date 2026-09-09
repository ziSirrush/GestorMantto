-- FIX SEGUIMIENTO ESPECIAL COMO CAPA PERSONAL DE NOTIFICACIONES V001
-- Base de codigo: e3a61935333d3edeb1a88e9457532c748a24aaba
-- IMPORTANTE: este archivo NO fue ejecutado automaticamente.
-- Ejecutar primero en un ambiente controlado y con autorizacion explicita.

USE mydb;

SET @schema_name := DATABASE();
SET @visual_column_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @schema_name
    AND TABLE_NAME = 'sup_notificaciones'
    AND COLUMN_NAME = 'codigos_visuales_json'
);

SET @ddl_visual_metadata := IF(
  @visual_column_exists = 0,
  'ALTER TABLE sup_notificaciones ADD COLUMN codigos_visuales_json JSON NULL AFTER trace_id',
  'SELECT ''codigos_visuales_json ya existe; ALTER omitido'' AS resultado'
);

PREPARE stmt_visual_metadata FROM @ddl_visual_metadata;
EXECUTE stmt_visual_metadata;
DEALLOCATE PREPARE stmt_visual_metadata;

INSERT INTO notificacion_eventos (
  codigo_evento,
  agrupacion,
  modulo,
  accion,
  nombre_evento,
  descripcion,
  prioridad_default,
  configurable,
  obligatoria,
  campana_default,
  push_default,
  correo_default,
  titulo_default,
  mensaje_default,
  icono_default,
  accion_destino,
  ruta_default,
  orden,
  activo
)
SELECT
  source.codigo_evento,
  source.agrupacion,
  source.modulo,
  source.accion,
  source.nombre_evento,
  source.descripcion,
  source.prioridad_default,
  source.configurable,
  source.obligatoria,
  source.campana_default,
  source.push_default,
  source.correo_default,
  source.titulo_default,
  source.mensaje_default,
  source.icono_default,
  source.accion_destino,
  source.ruta_default,
  source.orden,
  source.activo
FROM (
  SELECT
    'PORTAFOLIO_EQUIPO_INGRESO' AS codigo_evento,
    'Portafolio' AS agrupacion,
    'Proyectos de Mantenimiento' AS modulo,
    'INGRESO_EQUIPO' AS accion,
    'Ingreso de Equipo a Portafolio' AS nombre_evento,
    'Un Equipo ingreso al Portafolio de Mantenimiento.' AS descripcion,
    'MEDIA' AS prioridad_default,
    1 AS configurable,
    0 AS obligatoria,
    1 AS campana_default,
    0 AS push_default,
    0 AS correo_default,
    'Ingreso de Equipo a Portafolio' AS titulo_default,
    'Un Equipo ingreso al Portafolio.' AS mensaje_default,
    NULL AS icono_default,
    'ABRIR_EQUIPO' AS accion_destino,
    'portafolio' AS ruta_default,
    100 AS orden,
    1 AS activo
  UNION ALL
  SELECT
    'PORTAFOLIO_EQUIPO_SALIDA', 'Portafolio', 'Proyectos de Mantenimiento',
    'SALIDA_EQUIPO', 'Salida de Equipo de Portafolio',
    'Un Equipo salio del Portafolio de Mantenimiento.',
    'MEDIA', 1, 0, 1, 0, 0,
    'Salida de Equipo de Portafolio', 'Un Equipo salio del Portafolio.',
    NULL, 'ABRIR_EQUIPO', 'portafolio', 101, 1
  UNION ALL
  SELECT
    'PORTAFOLIO_EQUIPO_CAMBIO', 'Portafolio', 'Proyectos de Mantenimiento',
    'CAMBIO_EQUIPO', 'Cambio de Equipo en Portafolio',
    'Cambio relevante de un Equipo en el Portafolio de Mantenimiento.',
    'MEDIA', 1, 0, 1, 0, 0,
    'Cambio de Equipo en Portafolio', 'Se actualizo un Equipo del Portafolio.',
    NULL, 'ABRIR_EQUIPO', 'portafolio', 102, 1
  UNION ALL
  SELECT
    'TICKET_CREADO', 'Operacion', 'Tickets',
    'CREAR_TICKET', 'Ticket creado',
    'Se creo un Ticket de mantenimiento.',
    'MEDIA', 1, 0, 1, 1, 0,
    'Nuevo Ticket', 'Se creo un Ticket de mantenimiento.',
    'ti ti-ticket', 'ABRIR_TICKET', NULL, 110, 1
  UNION ALL
  SELECT
    'TICKET_ESTATUS_CAMBIADO', 'Operacion', 'Tickets',
    'CAMBIAR_ESTATUS_TICKET', 'Estatus de Ticket actualizado',
    'Cambio de estatus de un Ticket de mantenimiento.',
    'MEDIA', 1, 0, 1, 1, 0,
    'Estatus de Ticket actualizado', 'Cambio el estatus de un Ticket.',
    'ti ti-ticket', 'ABRIR_TICKET', NULL, 111, 1
  UNION ALL
  SELECT
    'TICKET_PRIORIDAD_CAMBIADA', 'Operacion', 'Tickets',
    'CAMBIAR_PRIORIDAD_TICKET', 'Prioridad de Ticket actualizada',
    'Cambio de prioridad de un Ticket de mantenimiento.',
    'ALTA', 1, 0, 1, 1, 0,
    'Prioridad de Ticket actualizada', 'Cambio la prioridad de un Ticket.',
    'ti ti-ticket', 'ABRIR_TICKET', NULL, 112, 1
  UNION ALL
  SELECT
    'TICKET_ASIGNACION_CAMBIADA', 'Operacion', 'Tickets',
    'CAMBIAR_ASIGNACION_TICKET', 'Asignacion de Ticket actualizada',
    'Cambio de responsables asignados a un Ticket de mantenimiento.',
    'MEDIA', 1, 0, 1, 1, 0,
    'Asignacion de Ticket actualizada', 'Cambio la asignacion de un Ticket.',
    'ti ti-ticket', 'ABRIR_TICKET', NULL, 113, 1
  UNION ALL
  SELECT
    'TICKET_RESPONSABILIDAD_CAMBIADA', 'Operacion', 'Tickets',
    'CAMBIAR_RESPONSABILIDAD_TICKET', 'Responsabilidad de Ticket actualizada',
    'Cambio de responsabilidad BLT o cliente de un Ticket de mantenimiento.',
    'ALTA', 1, 0, 1, 1, 0,
    'Responsabilidad de Ticket actualizada', 'Cambio la responsabilidad de un Ticket.',
    'ti ti-ticket', 'ABRIR_TICKET', NULL, 114, 1
) source
WHERE NOT EXISTS (
  SELECT 1
  FROM notificacion_eventos existing
  WHERE existing.codigo_evento = source.codigo_evento
);

-- Los eventos nativos de Ticket heredan la matriz vigente del comentario de
-- Ticket. La seleccion final sigue pasando por Evento + Rol y sus preferencias.
INSERT INTO notificacion_evento_roles (codigo_evento, id_rol, politica, activo)
SELECT
  target.codigo_evento,
  source.id_rol,
  source.politica,
  1
FROM (
  SELECT 'TICKET_CREADO' AS codigo_evento
  UNION ALL SELECT 'TICKET_ESTATUS_CAMBIADO'
  UNION ALL SELECT 'TICKET_PRIORIDAD_CAMBIADA'
  UNION ALL SELECT 'TICKET_ASIGNACION_CAMBIADA'
  UNION ALL SELECT 'TICKET_RESPONSABILIDAD_CAMBIADA'
) target
INNER JOIN notificacion_evento_roles source
  ON source.codigo_evento = 'tickets.comentario.creado'
 AND source.activo = 1
 AND source.politica IN ('OBLIGATORIA', 'OPCIONAL')
ON DUPLICATE KEY UPDATE
  politica = VALUES(politica),
  activo = 1,
  updated_at = CURRENT_TIMESTAMP;

SELECT
  COLUMN_NAME,
  COLUMN_TYPE,
  IS_NULLABLE
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'sup_notificaciones'
  AND COLUMN_NAME = 'codigos_visuales_json';

SELECT
  codigo_evento,
  prioridad_default,
  campana_default,
  push_default,
  activo
FROM notificacion_eventos
WHERE codigo_evento IN (
  'PORTAFOLIO_EQUIPO_INGRESO',
  'PORTAFOLIO_EQUIPO_SALIDA',
  'PORTAFOLIO_EQUIPO_CAMBIO',
  'TICKET_CREADO',
  'TICKET_ESTATUS_CAMBIADO',
  'TICKET_PRIORIDAD_CAMBIADA',
  'TICKET_ASIGNACION_CAMBIADA',
  'TICKET_RESPONSABILIDAD_CAMBIADA'
)
ORDER BY codigo_evento;
