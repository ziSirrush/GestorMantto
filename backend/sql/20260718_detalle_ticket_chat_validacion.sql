-- Mantto Gestor - Detalle Ticket: chat, validación y auditoría
-- Ejecutar una sola vez en Aiven MySQL antes del deploy del backend.

CREATE TABLE IF NOT EXISTS ticket_comentarios (
  id_comentario BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  id_ticket BIGINT NOT NULL,
  id_usuario BIGINT NOT NULL,
  comentario TEXT NOT NULL,
  activo TINYINT(1) NOT NULL DEFAULT 1,
  fecha_creacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  fecha_actualizacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id_comentario),
  KEY idx_ticket_comentarios_ticket (id_ticket, fecha_creacion),
  KEY idx_ticket_comentarios_usuario (id_usuario),
  CONSTRAINT fk_ticket_comentarios_ticket FOREIGN KEY (id_ticket) REFERENCES tickets(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_ticket_comentarios_usuario FOREIGN KEY (id_usuario) REFERENCES usuarios(id_SB) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ticket_validaciones (
  id_validacion BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  id_ticket BIGINT NOT NULL,
  id_usuario BIGINT NOT NULL,
  estado_anterior VARCHAR(120) DEFAULT NULL,
  estado_nuevo VARCHAR(120) NOT NULL,
  comentario TEXT,
  ip_origen VARCHAR(45) DEFAULT NULL,
  fecha_creacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id_validacion),
  KEY idx_ticket_validaciones_ticket (id_ticket, fecha_creacion),
  KEY idx_ticket_validaciones_usuario (id_usuario),
  CONSTRAINT fk_ticket_validaciones_ticket FOREIGN KEY (id_ticket) REFERENCES tickets(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_ticket_validaciones_usuario FOREIGN KEY (id_usuario) REFERENCES usuarios(id_SB) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET @db_name = DATABASE();
SET @sql = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db_name AND TABLE_NAME='tickets' AND COLUMN_NAME='vobo_por_id')=0,
  'ALTER TABLE tickets ADD COLUMN vobo_por_id BIGINT NULL AFTER vobo_comentario', 'SELECT 1'); PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db_name AND TABLE_NAME='tickets' AND COLUMN_NAME='vobo_por_nombre')=0,
  'ALTER TABLE tickets ADD COLUMN vobo_por_nombre VARCHAR(255) NULL AFTER vobo_por_id', 'SELECT 1'); PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db_name AND TABLE_NAME='tickets' AND COLUMN_NAME='vobo_en')=0,
  'ALTER TABLE tickets ADD COLUMN vobo_en DATETIME NULL AFTER vobo_por_nombre', 'SELECT 1'); PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
