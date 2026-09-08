USE mydb;

-- ============================================================
-- PRECHECK | SEGUIMIENTO ESPECIAL MANTTO V002
-- SOLO LECTURA. NO modifica datos.
-- ============================================================

SELECT DATABASE() AS base_actual;

-- 1) La tabla fue creada previamente por el usuario; este FIX NO la crea.
SELECT
  TABLE_NAME,
  ENGINE,
  TABLE_COLLATION
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'portafolio_interes';

SELECT
  COLUMN_NAME,
  COLUMN_TYPE,
  IS_NULLABLE,
  COLUMN_DEFAULT,
  COLUMN_KEY
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'portafolio_interes'
ORDER BY ORDINAL_POSITION;

-- 2) FK esperadas de la tabla ya creada.
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

-- 3) Agrupación y acciones nativas requeridas.
SELECT id_agrupacion, codigo, nombre, empresa, activo
FROM perm_agrupaciones
WHERE codigo = 'PORTAFOLIO';

SELECT id_accion, codigo, nombre, requiere_auditoria, activo
FROM perm_acciones
WHERE codigo IN ('ACCESO_VISUAL', 'GESTIONAR_SEGUIMIENTO')
ORDER BY codigo;

-- 4) Catálogo visual central: la estrella debe ser un indicador oficial.
SELECT id_estado_visual, codigo, nombre, categoria, emoji, icono, color_texto, color_fondo, color_borde, prioridad, activo
FROM estados_visuales
WHERE codigo = 'SEGUIMIENTO_ESPECIAL';

-- 5) Detectar si V001 fue aplicado accidentalmente y estado previo de V002.
SELECT id_modulo, id_agrupacion, codigo, nombre, ruta_frontend, orden, activo
FROM perm_modulos
WHERE codigo = 'PORTAFOLIO_SEGUIMIENTO_ESPECIAL';

SELECT id_subelemento_accion, codigo_permiso, activo
FROM perm_subelemento_acciones
WHERE codigo_permiso IN (
  'PORTAFOLIO_PROYECTOS_DE_MANTENIMIENTO_SEGUIMIENTO_INTERES_PROYECTO_EQUIPO.GESTIONAR_SEGUIMIENTO',
  'PORTAFOLIO_SEGUIMIENTO_ESPECIAL_ACCESO_VISUAL_MODULO.ACCESO_VISUAL',
  'PORTAFOLIO_SEGUIMIENTO_ESPECIAL_SEGUIMIENTO_PROYECTO_EQUIPO.GESTIONAR_SEGUIMIENTO'
)
ORDER BY codigo_permiso;

SELECT codigo_evento, agrupacion, modulo, accion, ruta_default, activo
FROM notificacion_eventos
WHERE codigo_evento IN (
  'PORTAFOLIO_INTERES_ACTUALIZACION',
  'PORTAFOLIO_SEGUIMIENTO_ESPECIAL_ACTUALIZACION'
)
ORDER BY codigo_evento;
