/* =====================================================================
   CFFAA-03 — SOPORTE SOBRE AZURE BLOB STORAGE
   Proyecto: Mantto Gestor
   Motor validado: MySQL 8.4.x

   Alcance:
   - Persiste la empresa interna de la solicitud de Soporte.
   - Mantiene sup_adjuntos como tabla funcional.
   - Conserva archivos historicos sin reclasificarlos artificialmente.
   - No elimina datos ni llaves foraneas existentes.
   ===================================================================== */

USE mydb;

DELIMITER $$

DROP PROCEDURE IF EXISTS cffaa03_add_column_if_missing$$
CREATE PROCEDURE cffaa03_add_column_if_missing(
  IN p_table VARCHAR(64),
  IN p_column VARCHAR(64),
  IN p_definition TEXT
)
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = p_table
       AND COLUMN_NAME = p_column
  ) THEN
    SET @cffaa03_sql = CONCAT(
      'ALTER TABLE `', REPLACE(p_table, '`', '``'),
      '` ADD COLUMN `', REPLACE(p_column, '`', '``'),
      '` ', p_definition
    );
    PREPARE cffaa03_stmt FROM @cffaa03_sql;
    EXECUTE cffaa03_stmt;
    DEALLOCATE PREPARE cffaa03_stmt;
  END IF;
END$$

DROP PROCEDURE IF EXISTS cffaa03_add_index_if_missing$$
CREATE PROCEDURE cffaa03_add_index_if_missing(
  IN p_table VARCHAR(64),
  IN p_index VARCHAR(64),
  IN p_columns TEXT
)
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = p_table
       AND INDEX_NAME = p_index
  ) THEN
    SET @cffaa03_sql = CONCAT(
      'ALTER TABLE `', REPLACE(p_table, '`', '``'),
      '` ADD INDEX `', REPLACE(p_index, '`', '``'),
      '` (', p_columns, ')'
    );
    PREPARE cffaa03_stmt FROM @cffaa03_sql;
    EXECUTE cffaa03_stmt;
    DEALLOCATE PREPARE cffaa03_stmt;
  END IF;
END$$

CALL cffaa03_add_column_if_missing(
  'sup_tickets',
  'empresa',
  'VARCHAR(150) NULL AFTER `id_usuario`'
)$$

CALL cffaa03_add_index_if_missing(
  'sup_tickets',
  'idx_sup_tickets_empresa',
  '`empresa`'
)$$

DROP PROCEDURE IF EXISTS cffaa03_add_index_if_missing$$
DROP PROCEDURE IF EXISTS cffaa03_add_column_if_missing$$

DELIMITER ;

/* Backfill conservador: toma la empresa del propietario de la solicitud
   solo cuando sup_tickets.empresa esta vacia. Safe Updates se restaura
   al valor previo de la sesion. */
SET @cffaa03_sql_safe_updates_anterior = @@SQL_SAFE_UPDATES;
SET SQL_SAFE_UPDATES = 0;

UPDATE sup_tickets t
INNER JOIN usuarios u
  ON u.id_SB = t.id_usuario
SET t.empresa = u.empresa
WHERE t.id_ticket IS NOT NULL
  AND (t.empresa IS NULL OR TRIM(t.empresa) = '')
  AND u.empresa IS NOT NULL
  AND TRIM(u.empresa) <> '';

SET SQL_SAFE_UPDATES = @cffaa03_sql_safe_updates_anterior;

SELECT 'CFFAA-03 migracion ejecutada. Ejecuta el postflight.' AS resultado;
