/* ================================================================
   CFFAA-01D — POSTFLIGHT DE VALIDACIÓN
   Solo lectura.
   ================================================================ */

USE mydb;

SELECT
  TABLE_NAME AS tabla,
  ENGINE AS motor,
  TABLE_COLLATION AS collation
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'storage_operaciones_pendientes';

SELECT
  ORDINAL_POSITION AS posicion,
  COLUMN_NAME AS columna,
  COLUMN_TYPE AS tipo,
  IS_NULLABLE AS permite_null,
  COLUMN_DEFAULT AS valor_default,
  EXTRA AS extra
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'storage_operaciones_pendientes'
ORDER BY ORDINAL_POSITION;

SELECT
  INDEX_NAME AS indice,
  NON_UNIQUE AS no_unico,
  SEQ_IN_INDEX AS orden,
  COLUMN_NAME AS columna,
  SUB_PART AS prefijo
FROM information_schema.STATISTICS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'storage_operaciones_pendientes'
ORDER BY INDEX_NAME, SEQ_IN_INDEX;

SELECT estado, COUNT(*) AS total
FROM storage_operaciones_pendientes
GROUP BY estado
ORDER BY estado;
