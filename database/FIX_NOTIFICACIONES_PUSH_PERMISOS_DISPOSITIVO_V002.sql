USE mydb;

CREATE TABLE sistema_permisos_dispositivo (
  permiso VARCHAR(30) NOT NULL,
  activo TINYINT(1) NOT NULL DEFAULT 1,
  requerido_login TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (permiso)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO sistema_permisos_dispositivo (permiso, activo, requerido_login)
VALUES
  ('GPS', 1, 1),
  ('CAMARA', 1, 1),
  ('MICROFONO', 1, 1),
  ('PUSH', 1, 1)
ON DUPLICATE KEY UPDATE
  activo = VALUES(activo),
  requerido_login = VALUES(requerido_login),
  updated_at = CURRENT_TIMESTAMP;

CREATE TABLE usuarios_dispositivos (
  id_dispositivo BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  id_usuario BIGINT NOT NULL,
  device_token CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  nombre_dispositivo VARCHAR(150) NULL,
  user_agent VARCHAR(500) NULL,
  gps_estado ENUM('PENDIENTE','PERMITIDO','DENEGADO','NO_DISPONIBLE') NOT NULL DEFAULT 'PENDIENTE',
  camara_estado ENUM('PENDIENTE','PERMITIDO','DENEGADO','NO_DISPONIBLE') NOT NULL DEFAULT 'PENDIENTE',
  microfono_estado ENUM('PENDIENTE','PERMITIDO','DENEGADO','NO_DISPONIBLE') NOT NULL DEFAULT 'PENDIENTE',
  push_estado ENUM('PENDIENTE','PERMITIDO','DENEGADO','NO_DISPONIBLE') NOT NULL DEFAULT 'PENDIENTE',
  activo TINYINT(1) NOT NULL DEFAULT 1,
  ultimo_acceso_at DATETIME NULL,
  permisos_revisados_at DATETIME NULL,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id_dispositivo),
  UNIQUE KEY uq_usuario_device_token (id_usuario, device_token),
  KEY idx_dispositivo_usuario_activo (id_usuario, activo),
  CONSTRAINT fk_usuarios_dispositivos_usuario
    FOREIGN KEY (id_usuario) REFERENCES usuarios (id_SB)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE notificaciones_push_suscripciones
  ADD COLUMN id_dispositivo BIGINT UNSIGNED NULL AFTER id_usuario,
  ADD KEY idx_push_dispositivo (id_dispositivo),
  ADD CONSTRAINT fk_push_dispositivo
    FOREIGN KEY (id_dispositivo) REFERENCES usuarios_dispositivos (id_dispositivo)
    ON DELETE SET NULL ON UPDATE CASCADE;
