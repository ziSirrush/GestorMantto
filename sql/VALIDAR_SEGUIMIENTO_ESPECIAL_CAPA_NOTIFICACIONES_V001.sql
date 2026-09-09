-- Validacion de solo lectura. No modifica Aiven.
USE mydb;

SHOW CREATE TABLE sup_notificaciones;
SHOW CREATE TABLE notificacion_eventos;
SHOW CREATE TABLE portafolio_interes;
SHOW CREATE TABLE portafolio;
SHOW CREATE TABLE tickets;
SHOW CREATE TABLE estados_visuales;

SELECT
  id_estado_visual,
  codigo,
  nombre,
  categoria,
  emoji,
  icono,
  prioridad,
  activo,
  updated_at
FROM estados_visuales
WHERE codigo = 'SEGUIMIENTO_ESPECIAL';

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
  agrupacion,
  modulo,
  accion,
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

SELECT
  ner.codigo_evento,
  ner.id_rol,
  ner.politica,
  ner.activo
FROM notificacion_evento_roles ner
WHERE ner.codigo_evento IN (
  'TICKET_CREADO',
  'TICKET_ESTATUS_CAMBIADO',
  'TICKET_PRIORIDAD_CAMBIADA',
  'TICKET_ASIGNACION_CAMBIADA',
  'TICKET_RESPONSABILIDAD_CAMBIADA'
)
ORDER BY ner.codigo_evento, ner.id_rol;

SELECT
  id_usuario,
  tipo_notificacion,
  clave_deduplicacion,
  COUNT(*) AS entregas_logicas
FROM sup_notificaciones
WHERE clave_deduplicacion IS NOT NULL
GROUP BY id_usuario, tipo_notificacion, clave_deduplicacion
HAVING COUNT(*) > 1;

SELECT
  id_notificacion,
  id_usuario,
  tipo_notificacion,
  titulo_notificacion,
  codigos_visuales_json,
  clave_deduplicacion,
  trace_id,
  fecha_creacion
FROM sup_notificaciones
WHERE JSON_CONTAINS(
  COALESCE(codigos_visuales_json, JSON_ARRAY()),
  JSON_QUOTE('SEGUIMIENTO_ESPECIAL')
)
ORDER BY id_notificacion DESC
LIMIT 100;

SELECT
  codigo_evento,
  SUM(cantidad) AS entregas,
  SUM(CASE WHEN seguimiento_especial = 1 THEN cantidad ELSE 0 END) AS entregas_con_seguimiento
FROM (
  SELECT
    tipo_notificacion AS codigo_evento,
    CASE
      WHEN JSON_CONTAINS(
        COALESCE(codigos_visuales_json, JSON_ARRAY()),
        JSON_QUOTE('SEGUIMIENTO_ESPECIAL')
      ) THEN 1 ELSE 0
    END AS seguimiento_especial,
    COUNT(*) AS cantidad
  FROM sup_notificaciones
  WHERE fecha_creacion >= DATE_SUB(NOW(), INTERVAL 7 DAY)
  GROUP BY tipo_notificacion, seguimiento_especial
) recent
GROUP BY codigo_evento
ORDER BY codigo_evento;
