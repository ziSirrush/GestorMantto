/* ================================================================
   CFFAA-00 — ALINEACIÓN ADITIVA DE METADATOS AZURE STORAGE
   Proyecto: Mantto Gestor
   Motor validado: MySQL 8.4.x

   Características:
   - Idempotente: puede ejecutarse nuevamente.
   - No elimina ni transforma registros históricos.
   - No modifica llaves foráneas existentes.
   - No unifica tablas funcionales de adjuntos.
   ================================================================ */

USE mydb;

DELIMITER $$

DROP PROCEDURE IF EXISTS cffaa_add_column_if_missing$$
CREATE PROCEDURE cffaa_add_column_if_missing(
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
    SET @cffaa_sql = CONCAT(
      'ALTER TABLE `', REPLACE(p_table, '`', '``'),
      '` ADD COLUMN `', REPLACE(p_column, '`', '``'),
      '` ', p_definition
    );
    PREPARE cffaa_stmt FROM @cffaa_sql;
    EXECUTE cffaa_stmt;
    DEALLOCATE PREPARE cffaa_stmt;
  END IF;
END$$

DROP PROCEDURE IF EXISTS cffaa_add_index_if_missing$$
CREATE PROCEDURE cffaa_add_index_if_missing(
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
    SET @cffaa_sql = CONCAT(
      'ALTER TABLE `', REPLACE(p_table, '`', '``'),
      '` ADD INDEX `', REPLACE(p_index, '`', '``'),
      '` (', p_columns, ')'
    );
    PREPARE cffaa_stmt FROM @cffaa_sql;
    EXECUTE cffaa_stmt;
    DEALLOCATE PREPARE cffaa_stmt;
  END IF;
END$$

CALL cffaa_add_column_if_missing(
  'sup_adjuntos',
  'storage_provider',
  'VARCHAR(30) NULL AFTER `peso_archivo`'
)$$
CALL cffaa_add_column_if_missing(
  'sup_adjuntos',
  'storage_container',
  'VARCHAR(150) NULL AFTER `storage_provider`'
)$$
CALL cffaa_add_column_if_missing(
  'sup_adjuntos',
  'storage_blob_name',
  'VARCHAR(1024) NULL AFTER `storage_container`'
)$$
CALL cffaa_add_index_if_missing(
  'sup_adjuntos',
  'idx_sup_adjuntos_storage',
  '`storage_provider`, `storage_blob_name`(191)'
)$$

CALL cffaa_add_column_if_missing(
  'pendientes_comentarios_adjuntos',
  'storage_provider',
  'VARCHAR(30) NULL AFTER `tipo_archivo`'
)$$
CALL cffaa_add_column_if_missing(
  'pendientes_comentarios_adjuntos',
  'storage_container',
  'VARCHAR(150) NULL AFTER `storage_provider`'
)$$
CALL cffaa_add_column_if_missing(
  'pendientes_comentarios_adjuntos',
  'storage_blob_name',
  'VARCHAR(1024) NULL AFTER `storage_container`'
)$$
CALL cffaa_add_column_if_missing(
  'pendientes_comentarios_adjuntos',
  'tamano_bytes',
  'BIGINT UNSIGNED NULL AFTER `storage_blob_name`'
)$$
CALL cffaa_add_column_if_missing(
  'pendientes_comentarios_adjuntos',
  'subido_por',
  'INT NULL AFTER `tamano_bytes`'
)$$
CALL cffaa_add_column_if_missing(
  'pendientes_comentarios_adjuntos',
  'activo',
  'TINYINT(1) NOT NULL DEFAULT 1 AFTER `subido_por`'
)$$
CALL cffaa_add_column_if_missing(
  'pendientes_comentarios_adjuntos',
  'updated_at',
  'TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER `fecha`'
)$$
CALL cffaa_add_index_if_missing(
  'pendientes_comentarios_adjuntos',
  'idx_pca_storage',
  '`storage_provider`, `storage_blob_name`(191)'
)$$
CALL cffaa_add_index_if_missing(
  'pendientes_comentarios_adjuntos',
  'idx_pca_activo',
  '`activo`'
)$$
CALL cffaa_add_index_if_missing(
  'pendientes_comentarios_adjuntos',
  'idx_pca_subido_por',
  '`subido_por`'
)$$

DROP PROCEDURE IF EXISTS cffaa_add_index_if_missing$$
DROP PROCEDURE IF EXISTS cffaa_add_column_if_missing$$

DELIMITER ;

SELECT 'CFFAA-00 migración ejecutada. Ejecuta el postflight.' AS resultado;
