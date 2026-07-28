-- Mantto Gestor - Ventas Cotizaciones - Fase 3
-- Bitácora operativa y auditoría de acciones iniciadas desde frontend.

CREATE TABLE IF NOT EXISTS ventas_cotizaciones_historial (
  id_historial BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  id_cotizacion BIGINT UNSIGNED NOT NULL,
  accion VARCHAR(40) NOT NULL,
  comentario TEXT NULL,
  motivo TEXT NULL,
  detalle_anterior JSON NULL,
  detalle_nuevo JSON NULL,
  proxima_fecha DATE NULL,
  id_usuario BIGINT UNSIGNED NOT NULL,
  ip VARCHAR(45) NULL,
  user_agent VARCHAR(255) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id_historial),
  KEY idx_vch_cotizacion_fecha (id_cotizacion, created_at),
  KEY idx_vch_usuario_fecha (id_usuario, created_at),
  KEY idx_vch_accion_fecha (accion, created_at),
  CONSTRAINT fk_vch_cotizacion
    FOREIGN KEY (id_cotizacion) REFERENCES ventas_cotizaciones_cor (id_cotizacion),
  CONSTRAINT fk_vch_usuario
    FOREIGN KEY (id_usuario) REFERENCES usuarios (id_SB)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
