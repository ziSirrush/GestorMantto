/* =====================================================================
   CFFAA-02 — HOME / PENDIENTES SOBRE AZURE BLOB STORAGE
   Proyecto: Mantto Gestor
   Motor validado: MySQL 8.4.x

   Alcance:
   - Persiste la empresa de la tarea.
   - Crea la tabla propia pendientes_archivos para evidencia directa.
   - Conserva photo_url y adjunto_url como legado, sin migrarlos.
   - No unifica tablas funcionales de adjuntos.
   - No elimina datos ni llaves foráneas existentes.
   ===================================================================== */

USE mydb;

DELIMITER $$

DROP PROCEDURE IF EXISTS cffaa02_add_column_if_missing$$
CREATE PROCEDURE cffaa02_add_column_if_missing(
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
    SET @cffaa02_sql = CONCAT(
      'ALTER TABLE `', REPLACE(p_table, '`', '``'),
      '` ADD COLUMN `', REPLACE(p_column, '`', '``'),
      '` ', p_definition
    );
    PREPARE cffaa02_stmt FROM @cffaa02_sql;
    EXECUTE cffaa02_stmt;
    DEALLOCATE PREPARE cffaa02_stmt;
  END IF;
END$$

DROP PROCEDURE IF EXISTS cffaa02_add_index_if_missing$$
CREATE PROCEDURE cffaa02_add_index_if_missing(
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
    SET @cffaa02_sql = CONCAT(
      'ALTER TABLE `', REPLACE(p_table, '`', '``'),
      '` ADD INDEX `', REPLACE(p_index, '`', '``'),
      '` (', p_columns, ')'
    );
    PREPARE cffaa02_stmt FROM @cffaa02_sql;
    EXECUTE cffaa02_stmt;
    DEALLOCATE PREPARE cffaa02_stmt;
  END IF;
END$$

CALL cffaa02_add_column_if_missing(
  'pendientes',
  'empresa',
  'VARCHAR(150) NULL AFTER `area`'
)$$

CALL cffaa02_add_index_if_missing(
  'pendientes',
  'idx_pendientes_empresa',
  '`empresa`'
)$$

DROP PROCEDURE IF EXISTS cffaa02_add_index_if_missing$$
DROP PROCEDURE IF EXISTS cffaa02_add_column_if_missing$$

DELIMITER ;

/* Backfill conservador: solo usa la empresa del usuario creador cuando
   la tarea aún no tiene empresa. No altera tareas ya clasificadas. */
UPDATE pendientes p
INNER JOIN usuarios u
  ON LOWER(TRIM(u.correo)) = LOWER(TRIM(p.creado_por_email))
SET p.empresa = u.empresa
WHERE (p.empresa IS NULL OR TRIM(p.empresa) = '')
  AND u.empresa IS NOT NULL
  AND TRIM(u.empresa) <> '';

CREATE TABLE IF NOT EXISTS pendientes_archivos (
  id_archivo BIGINT NOT NULL AUTO_INCREMENT,
  id_pendiente BIGINT NOT NULL,
  tipo_archivo ENUM('FOTO','ADJUNTO') NOT NULL,
  nombre_original VARCHAR(255) NOT NULL,
  mime_type VARCHAR(150) NULL,
  tamano_bytes BIGINT UNSIGNED NULL,
  storage_provider VARCHAR(30) NOT NULL DEFAULT 'AZURE_BLOB',
  storage_container VARCHAR(150) NULL,
  storage_blob_name VARCHAR(1024) NOT NULL,
  storage_url VARCHAR(2048) NULL,
  origen_archivo ENUM('NUEVO','LEGACY') NOT NULL DEFAULT 'NUEVO',
  subido_por BIGINT NULL,
  activo TINYINT(1) NOT NULL DEFAULT 1,
  eliminado_por BIGINT NULL,
  eliminado_at DATETIME NULL,
  motivo_baja VARCHAR(80) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id_archivo),
  KEY idx_pendientes_archivos_tarea (id_pendiente, activo, id_archivo),
  KEY idx_pendientes_archivos_tipo (id_pendiente, tipo_archivo, activo),
  KEY idx_pendientes_archivos_storage (storage_provider, storage_blob_name(191)),
  KEY idx_pendientes_archivos_subido (subido_por),
  KEY idx_pendientes_archivos_eliminado (eliminado_por),
  CONSTRAINT fk_pendientes_archivos_pendiente
    FOREIGN KEY (id_pendiente)
    REFERENCES pendientes (id_pendiente)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT fk_pendientes_archivos_subido_por
    FOREIGN KEY (subido_por)
    REFERENCES usuarios (id_SB)
    ON DELETE SET NULL
    ON UPDATE CASCADE,
  CONSTRAINT fk_pendientes_archivos_eliminado_por
    FOREIGN KEY (eliminado_por)
    REFERENCES usuarios (id_SB)
    ON DELETE SET NULL
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

SELECT 'CFFAA-02 migración ejecutada. Ejecuta el postflight.' AS resultado;
