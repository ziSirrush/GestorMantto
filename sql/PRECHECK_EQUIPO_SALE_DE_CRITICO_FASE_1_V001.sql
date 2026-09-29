-- Mantto Gestor · PRECHECK · EQUIPO_SALE_DE_CRITICO · Fase 1 V001
-- Solo lectura. No modifica Aiven.

SELECT DATABASE() AS schema_actual, NOW() AS fecha_revision;

SELECT
  c.column_name,
  c.column_type,
  c.is_nullable
FROM information_schema.columns c
WHERE c.table_schema = DATABASE()
  AND c.table_name = 'notificacion_eventos'
  AND c.column_name IN (
    'codigo_evento','agrupacion','modulo','accion','nombre_evento','descripcion',
    'prioridad_default','configurable','obligatoria','campana_default','push_default',
    'correo_default','titulo_default','mensaje_default','icono_default',
    'accion_destino','ruta_default','orden','activo'
  )
ORDER BY c.ordinal_position;

SELECT
  codigo_evento,
  agrupacion,
  modulo,
  accion,
  nombre_evento,
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
