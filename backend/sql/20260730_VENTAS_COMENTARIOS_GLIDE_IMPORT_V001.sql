-- Preparación de comentarios y archivos históricos de Cotizaciones (Glide -> Aiven)

ALTER TABLE ventas_cotizaciones_comentarios
  ADD COLUMN id_origen VARCHAR(150) NULL AFTER id_usuario,
  ADD COLUMN zona_horaria_origen VARCHAR(100) NULL AFTER comentario,
  ADD COLUMN zona_origen_confirmada TINYINT(1) NOT NULL DEFAULT 0 AFTER zona_horaria_origen;

ALTER TABLE ventas_cotizaciones_archivos
  MODIFY COLUMN drive_file_id VARCHAR(255) NULL,
  ADD COLUMN storage_provider VARCHAR(30) NULL AFTER tamanio_bytes,
  ADD COLUMN storage_url TEXT NULL AFTER storage_provider,
  ADD COLUMN storage_container VARCHAR(150) NULL AFTER storage_url,
  ADD COLUMN storage_blob_name VARCHAR(500) NULL AFTER storage_container,
  ADD COLUMN thumbnail_url TEXT NULL AFTER storage_blob_name,
  ADD INDEX idx_vca_storage_provider (storage_provider),
  ADD INDEX idx_vca_storage_blob (storage_container, storage_blob_name(191));

-- Los registros históricos importados por el receptor se guardarán como GLIDE_STORAGE.
-- Los futuros archivos de Azure se clasificarán desde backend cuando esa integración sea habilitada.
