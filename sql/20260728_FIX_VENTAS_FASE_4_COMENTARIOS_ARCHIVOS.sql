CREATE TABLE IF NOT EXISTS ventas_cotizaciones_comentarios (
  id_comentario BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  id_cotizacion BIGINT UNSIGNED NOT NULL,
  id_usuario BIGINT NOT NULL,
  comentario TEXT NOT NULL,
  id_comentario_padre BIGINT UNSIGNED NULL,
  editado TINYINT(1) NOT NULL DEFAULT 0,
  activo TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id_comentario),
  KEY idx_vcc_cotizacion (id_cotizacion, activo, created_at),
  KEY idx_vcc_usuario (id_usuario),
  KEY idx_vcc_padre (id_comentario_padre),
  CONSTRAINT fk_vcc_cotizacion FOREIGN KEY (id_cotizacion)
    REFERENCES ventas_cotizaciones_cor (id_cotizacion) ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_vcc_usuario FOREIGN KEY (id_usuario)
    REFERENCES usuarios (id_SB) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_vcc_padre FOREIGN KEY (id_comentario_padre)
    REFERENCES ventas_cotizaciones_comentarios (id_comentario) ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ventas_cotizaciones_archivos (
  id_archivo BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  id_cotizacion BIGINT UNSIGNED NOT NULL,
  id_comentario BIGINT UNSIGNED NULL,
  id_usuario BIGINT NOT NULL,
  nombre_archivo VARCHAR(255) NOT NULL,
  nombre_original VARCHAR(255) NULL,
  extension VARCHAR(20) NULL,
  mime_type VARCHAR(150) NULL,
  tamanio_bytes BIGINT UNSIGNED NULL,
  drive_file_id VARCHAR(255) NOT NULL,
  drive_folder_id VARCHAR(255) NULL,
  drive_url TEXT NULL,
  tipo_archivo VARCHAR(100) NULL,
  descripcion VARCHAR(500) NULL,
  version_numero INT UNSIGNED NOT NULL DEFAULT 1,
  id_archivo_anterior BIGINT UNSIGNED NULL,
  activo TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id_archivo),
  UNIQUE KEY uq_vca_drive_file (drive_file_id),
  KEY idx_vca_cotizacion (id_cotizacion, activo, created_at),
  KEY idx_vca_comentario (id_comentario),
  KEY idx_vca_usuario (id_usuario),
  KEY idx_vca_tipo (tipo_archivo),
  KEY idx_vca_version_anterior (id_archivo_anterior),
  CONSTRAINT fk_vca_cotizacion FOREIGN KEY (id_cotizacion)
    REFERENCES ventas_cotizaciones_cor (id_cotizacion) ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_vca_comentario FOREIGN KEY (id_comentario)
    REFERENCES ventas_cotizaciones_comentarios (id_comentario) ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT fk_vca_usuario FOREIGN KEY (id_usuario)
    REFERENCES usuarios (id_SB) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_vca_anterior FOREIGN KEY (id_archivo_anterior)
    REFERENCES ventas_cotizaciones_archivos (id_archivo) ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
