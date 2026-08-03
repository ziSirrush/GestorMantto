-- Mantto Gestor - Azure Storage para cargas activas
-- Migracion aditiva. Ejecutar una sola vez en Aiven antes de desplegar el backend.
-- No elimina ni renombra columnas existentes.

START TRANSACTION;

ALTER TABLE sup_adjuntos
  ADD COLUMN storage_provider VARCHAR(30) NULL AFTER peso_archivo,
  ADD COLUMN storage_container VARCHAR(150) NULL AFTER storage_provider,
  ADD COLUMN storage_blob_name VARCHAR(500) NULL AFTER storage_container,
  ADD INDEX idx_sup_adjuntos_storage (storage_provider, storage_blob_name);

ALTER TABLE pendientes_comentarios_adjuntos
  ADD COLUMN storage_provider VARCHAR(30) NULL AFTER tipo_archivo,
  ADD COLUMN storage_container VARCHAR(150) NULL AFTER storage_provider,
  ADD COLUMN storage_blob_name VARCHAR(500) NULL AFTER storage_container,
  ADD COLUMN tamano_bytes BIGINT UNSIGNED NULL AFTER storage_blob_name,
  ADD COLUMN subido_por BIGINT NULL AFTER tamano_bytes,
  ADD COLUMN activo TINYINT(1) NOT NULL DEFAULT 1 AFTER subido_por,
  ADD COLUMN updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER fecha,
  ADD INDEX idx_pca_storage (storage_provider, storage_blob_name),
  ADD INDEX idx_pca_activo (activo),
  ADD INDEX idx_pca_subido_por (subido_por);

COMMIT;

-- No ejecutar si estas columnas ya fueron agregadas con fase_3_azure_storage_aditiva.sql.
