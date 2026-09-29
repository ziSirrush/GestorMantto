-- Mantto Gestor · VALIDAR · EQUIPO_SALE_DE_CRITICO · Fase 2 V001
-- Solo lectura.

SET @schema_name = DATABASE();

SELECT
  codigo_evento,
  agrupacion,
  modulo,
  accion,
  nombre_evento,
  descripcion,
  prioridad_default,
  configurable,
  campana_default,
  push_default,
  icono_default,
  accion_destino,
  ruta_default,
  activo
FROM notificacion_eventos
WHERE codigo_evento = 'EQUIPO_SALE_DE_CRITICO';

SELECT
  ner.codigo_evento,
  ner.id_rol,
  r.rol,
  ner.politica,
  ner.activo
FROM notificacion_evento_roles ner
LEFT JOIN roles r ON r.id_rol = ner.id_rol
WHERE ner.codigo_evento = 'EQUIPO_SALE_DE_CRITICO'
ORDER BY ner.id_rol;

SELECT
  c.column_name,
  c.column_type,
  c.is_nullable
FROM information_schema.columns c
WHERE c.table_schema = @schema_name
  AND c.table_name = 'sup_notificaciones'
  AND c.column_name IN ('clave_deduplicacion', 'trace_id')
ORDER BY c.ordinal_position;

SELECT
  s.index_name,
  s.non_unique,
  GROUP_CONCAT(s.column_name ORDER BY s.seq_in_index SEPARATOR ', ') AS columnas
FROM information_schema.statistics s
WHERE s.table_schema = @schema_name
  AND s.table_name = 'sup_notificaciones'
  AND s.index_name = 'uq_sup_notif_evento_logico'
GROUP BY s.index_name, s.non_unique;

-- Diagnostico de duplicados historicos del evento. Resultado esperado: 0 filas
-- para notificaciones con clave de deduplicacion no nula.
SELECT
  id_usuario,
  tipo_notificacion,
  clave_deduplicacion,
  COUNT(*) AS total
FROM sup_notificaciones
WHERE tipo_notificacion = 'EQUIPO_SALE_DE_CRITICO'
  AND clave_deduplicacion IS NOT NULL
GROUP BY id_usuario, tipo_notificacion, clave_deduplicacion
HAVING COUNT(*) > 1;
