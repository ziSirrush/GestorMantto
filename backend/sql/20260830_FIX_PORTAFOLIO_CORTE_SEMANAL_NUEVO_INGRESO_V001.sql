-- [Codex | 2026-08-30 | ASTER-MG | CORTE_SEMANAL_NUEVO_INGRESO_V001]
-- Objetivo:
--   Persistir por separado los nuevos ingresos detectados entre snapshots
--   semanales. No modifica estatus_ul_mes ni estatus_ul_mes_fecha.
--
-- IMPORTANTE:
--   - DDL en MySQL realiza COMMIT implicito.
--   - Ejecutar antes de desplegar el backend de este cambio.
--   - Es idempotente: no vuelve a crear la columna si ya existe.

SET @mg_schema = DATABASE();
SET @mg_has_total_ingresos = (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @mg_schema
    AND TABLE_NAME = 'portafolio_cortes_semanales'
    AND COLUMN_NAME = 'total_ingresos'
);

SET @mg_sql = IF(
  @mg_has_total_ingresos = 0,
  'ALTER TABLE portafolio_cortes_semanales ADD COLUMN total_ingresos INT UNSIGNED NOT NULL DEFAULT 0 AFTER total_cambios',
  'SELECT ''total_ingresos ya existe'' AS info'
);

PREPARE mg_stmt FROM @mg_sql;
EXECUTE mg_stmt;
DEALLOCATE PREPARE mg_stmt;

SELECT
  COLUMN_NAME,
  COLUMN_TYPE,
  IS_NULLABLE,
  COLUMN_DEFAULT
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'portafolio_cortes_semanales'
  AND COLUMN_NAME = 'total_ingresos';
