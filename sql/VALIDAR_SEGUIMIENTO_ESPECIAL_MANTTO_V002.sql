USE mydb;

-- ============================================================
-- VALIDAR | SEGUIMIENTO ESPECIAL MANTTO V002
-- SOLO LECTURA.
-- ============================================================

SELECT
  pm.id_modulo,
  pa.codigo AS agrupacion,
  pm.codigo,
  pm.nombre,
  pm.ruta_frontend,
  pm.orden,
  pm.activo
FROM perm_modulos pm
INNER JOIN perm_agrupaciones pa ON pa.id_agrupacion = pm.id_agrupacion
WHERE pm.codigo = 'PORTAFOLIO_SEGUIMIENTO_ESPECIAL';

SELECT
  psa.codigo_permiso,
  psa.activo,
  ps.codigo AS subelemento,
  pac.codigo AS accion,
  pm.codigo AS modulo
FROM perm_subelemento_acciones psa
INNER JOIN perm_subelementos ps ON ps.id_subelemento = psa.id_subelemento
INNER JOIN perm_elementos pe ON pe.id_elemento = ps.id_elemento
INNER JOIN perm_modulos pm ON pm.id_modulo = pe.id_modulo
INNER JOIN perm_acciones pac ON pac.id_accion = psa.id_accion
WHERE psa.codigo_permiso IN (
  'PORTAFOLIO_SEGUIMIENTO_ESPECIAL_ACCESO_VISUAL_MODULO.ACCESO_VISUAL',
  'PORTAFOLIO_SEGUIMIENTO_ESPECIAL_SEGUIMIENTO_PROYECTO_EQUIPO.GESTIONAR_SEGUIMIENTO'
)
ORDER BY psa.codigo_permiso;

SELECT
  id_estado_visual,
  codigo,
  nombre,
  categoria,
  emoji,
  icono,
  color_texto,
  color_fondo,
  color_borde,
  prioridad,
  activo
FROM estados_visuales
WHERE codigo = 'SEGUIMIENTO_ESPECIAL';

SELECT
  codigo_evento,
  agrupacion,
  modulo,
  accion,
  configurable,
  campana_default,
  push_default,
  icono_default,
  ruta_default,
  activo
FROM notificacion_eventos
WHERE codigo_evento = 'PORTAFOLIO_SEGUIMIENTO_ESPECIAL_ACTUALIZACION';

SELECT
  COUNT(*) AS relaciones_totales,
  SUM(CASE WHEN activo = 1 THEN 1 ELSE 0 END) AS relaciones_activas,
  COUNT(DISTINCT CASE WHEN activo = 1 THEN id_usuario END) AS usuarios_con_seguimiento
FROM portafolio_interes;

SELECT
  CONSTRAINT_NAME,
  COLUMN_NAME,
  REFERENCED_TABLE_NAME,
  REFERENCED_COLUMN_NAME
FROM information_schema.KEY_COLUMN_USAGE
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'portafolio_interes'
  AND REFERENCED_TABLE_NAME IS NOT NULL
ORDER BY CONSTRAINT_NAME;

-- V001 debe quedar lógicamente sustituido por V002 si existía.
SELECT
  codigo_permiso,
  activo AS activo_esperado_0
FROM perm_subelemento_acciones
WHERE codigo_permiso =
  'PORTAFOLIO_PROYECTOS_DE_MANTENIMIENTO_SEGUIMIENTO_INTERES_PROYECTO_EQUIPO.GESTIONAR_SEGUIMIENTO';

SELECT
  codigo_evento,
  activo AS activo_esperado_0
FROM notificacion_eventos
WHERE codigo_evento = 'PORTAFOLIO_INTERES_ACTUALIZACION';
