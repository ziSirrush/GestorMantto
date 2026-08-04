CREATE TABLE IF NOT EXISTS instalaciones_comentarios_junta (
  id_comentario BIGINT NOT NULL AUTO_INCREMENT,
  id_usuario BIGINT NOT NULL,
  id_proyecto VARCHAR(100) NULL,
  proyecto VARCHAR(255) NULL,
  referencia_sitio VARCHAR(255) NOT NULL,
  comentario TEXT NOT NULL,
  responsables VARCHAR(1000) NULL,
  semana_iso VARCHAR(10) NOT NULL,
  semana_orden INT NOT NULL,
  activo TINYINT(1) NOT NULL DEFAULT 1,
  fecha_creacion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id_comentario),
  KEY idx_icj_usuario_fecha (id_usuario, fecha_creacion),
  KEY idx_icj_referencia (referencia_sitio),
  CONSTRAINT fk_icj_usuario FOREIGN KEY (id_usuario) REFERENCES usuarios(id_SB)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
