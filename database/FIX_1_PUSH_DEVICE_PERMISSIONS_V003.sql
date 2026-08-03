USE mydb;

-- FIX 1 V002: estabilizacion de permisos nativos y Push por dispositivo.
-- Incluye ajuste para agregar la FK cuando usuarios_dispositivos ya existe.
-- Compatible con usuarios.id_SB BIGINT firmado.

CREATE TABLE IF NOT EXISTS sistema_permisos_dispositivo (
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

CREATE TABLE IF NOT EXISTS usuarios_dispositivos (
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

-- Ajuste V002: cuando usuarios_dispositivos ya existia, CREATE TABLE IF NOT EXISTS
-- no agregaba la FK. Se agrega solamente si no existe y no hay registros huerfanos.
SELECT ud.id_dispositivo, ud.id_usuario, ud.device_token
FROM usuarios_dispositivos ud
LEFT JOIN usuarios u ON u.id_SB = ud.id_usuario
WHERE u.id_SB IS NULL;

SET @has_fk_usuarios_dispositivos_usuario := (
  SELECT COUNT(*)
  FROM information_schema.TABLE_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME = 'usuarios_dispositivos'
    AND CONSTRAINT_NAME = 'fk_usuarios_dispositivos_usuario'
    AND CONSTRAINT_TYPE = 'FOREIGN KEY'
);

SET @usuarios_dispositivos_orphans := (
  SELECT COUNT(*)
  FROM usuarios_dispositivos ud
  LEFT JOIN usuarios u ON u.id_SB = ud.id_usuario
  WHERE u.id_SB IS NULL
);

SET @sql := IF(
  @has_fk_usuarios_dispositivos_usuario = 0 AND @usuarios_dispositivos_orphans = 0,
  'ALTER TABLE usuarios_dispositivos ADD CONSTRAINT fk_usuarios_dispositivos_usuario FOREIGN KEY (id_usuario) REFERENCES usuarios (id_SB) ON DELETE CASCADE ON UPDATE CASCADE',
  'SELECT IF(@has_fk_usuarios_dispositivos_usuario > 0, ''FK usuarios_dispositivos ya existente'', ''FK no agregada: existen registros huerfanos'') AS resultado'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Agrega id_dispositivo a suscripciones Push solo cuando aun no existe.
SET @has_id_dispositivo := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'notificaciones_push_suscripciones'
    AND COLUMN_NAME = 'id_dispositivo'
);
SET @sql := IF(
  @has_id_dispositivo = 0,
  'ALTER TABLE notificaciones_push_suscripciones ADD COLUMN id_dispositivo BIGINT UNSIGNED NULL AFTER id_usuario',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_idx_push_dispositivo := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'notificaciones_push_suscripciones'
    AND INDEX_NAME = 'idx_push_dispositivo'
);
SET @sql := IF(
  @has_idx_push_dispositivo = 0,
  'ALTER TABLE notificaciones_push_suscripciones ADD KEY idx_push_dispositivo (id_dispositivo)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_fk_push_dispositivo := (
  SELECT COUNT(*)
  FROM information_schema.TABLE_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME = 'notificaciones_push_suscripciones'
    AND CONSTRAINT_NAME = 'fk_push_dispositivo'
    AND CONSTRAINT_TYPE = 'FOREIGN KEY'
);
SET @sql := IF(
  @has_fk_push_dispositivo = 0,
  'ALTER TABLE notificaciones_push_suscripciones ADD CONSTRAINT fk_push_dispositivo FOREIGN KEY (id_dispositivo) REFERENCES usuarios_dispositivos (id_dispositivo) ON DELETE SET NULL ON UPDATE CASCADE',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Verificacion final.
SHOW CREATE TABLE sistema_permisos_dispositivo;
SHOW CREATE TABLE usuarios_dispositivos;
SHOW CREATE TABLE notificaciones_push_suscripciones;
