USE mydb;

-- [Aster | 2026-09-08 | ASTER-MG | PRECHECK INTERES MANTTO PORTAFOLIO V001]
-- SOLO LECTURA. No modifica Aiven.

SELECT DATABASE() AS base_actual;

-- 1) La tabla operativa fue creada previamente por el usuario.
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
  EXTRA
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'portafolio_interes'
ORDER BY ORDINAL_POSITION;

SELECT
  CONSTRAINT_NAME,
  COLUMN_NAME,
  REFERENCED_TABLE_NAME,
  REFERENCED_COLUMN_NAME
FROM information_schema.KEY_COLUMN_USAGE
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'portafolio_interes'
  AND REFERENCED_TABLE_NAME IS NOT NULL
ORDER BY CONSTRAINT_NAME, ORDINAL_POSITION;

SELECT
  INDEX_NAME,
  NON_UNIQUE,
  GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) AS columnas
FROM information_schema.STATISTICS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'portafolio_interes'
GROUP BY INDEX_NAME, NON_UNIQUE
ORDER BY INDEX_NAME;

-- 2) Dependencias reales del catálogo de permisos.
SELECT id_agrupacion, codigo, nombre, empresa, activo
FROM perm_agrupaciones
WHERE codigo = 'PORTAFOLIO';

SELECT id_modulo, id_agrupacion, codigo, nombre, activo
FROM perm_modulos
WHERE codigo = 'PORTAFOLIO_PROYECTOS_DE_MANTENIMIENTO';

SELECT id_accion, codigo, nombre, requiere_auditoria, activo
FROM perm_acciones
WHERE codigo = 'GESTIONAR_SEGUIMIENTO';

-- 3) Estado previo del permiso que agregará el FIX.
SELECT id_elemento, id_modulo, codigo, nombre, tipo, activo
FROM perm_elementos
WHERE codigo = 'PORTAFOLIO_PROYECTOS_DE_MANTENIMIENTO_SEGUIMIENTO_INTERES';

SELECT id_subelemento, id_elemento, codigo, nombre, activo
FROM perm_subelementos
WHERE codigo = 'PORTAFOLIO_PROYECTOS_DE_MANTENIMIENTO_SEGUIMIENTO_INTERES_PROYECTO_EQUIPO';

SELECT id_subelemento_accion, id_subelemento, id_accion, codigo_permiso, activo
FROM perm_subelemento_acciones
WHERE codigo_permiso = 'PORTAFOLIO_PROYECTOS_DE_MANTENIMIENTO_SEGUIMIENTO_INTERES_PROYECTO_EQUIPO.GESTIONAR_SEGUIMIENTO';

-- 4) Estado previo del evento de notificación.
SELECT *
FROM notificacion_eventos
WHERE codigo_evento = 'PORTAFOLIO_INTERES_ACTUALIZACION';

SELECT *
FROM notificacion_evento_roles
WHERE codigo_evento = 'PORTAFOLIO_INTERES_ACTUALIZACION';
