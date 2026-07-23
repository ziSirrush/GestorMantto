-- Mantto Gestor - Panel de Control V008
-- Permisos jerárquicos por agrupación, módulo y elemento.
-- Los campos activo de los catálogos NO se usan para permisos individuales.

CREATE TABLE IF NOT EXISTS rol_agrupacion_permisos (
  id_rol_agrupacion_permiso BIGINT NOT NULL AUTO_INCREMENT,
  id_rol BIGINT NOT NULL,
  id_agrupacion BIGINT NOT NULL,
  permitido TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  created_by BIGINT NULL,
  updated_by BIGINT NULL,
  PRIMARY KEY (id_rol_agrupacion_permiso),
  UNIQUE KEY uq_rol_agrupacion_permiso (id_rol,id_agrupacion),
  CONSTRAINT fk_rap_rol FOREIGN KEY (id_rol) REFERENCES roles(id_rol) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_rap_agrupacion FOREIGN KEY (id_agrupacion) REFERENCES perm_agrupaciones(id_agrupacion) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_rap_created_by FOREIGN KEY (created_by) REFERENCES usuarios(id_SB) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT fk_rap_updated_by FOREIGN KEY (updated_by) REFERENCES usuarios(id_SB) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS rol_modulo_permisos (
  id_rol_modulo_permiso BIGINT NOT NULL AUTO_INCREMENT,
  id_rol BIGINT NOT NULL,
  id_modulo BIGINT NOT NULL,
  permitido TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  created_by BIGINT NULL,
  updated_by BIGINT NULL,
  PRIMARY KEY (id_rol_modulo_permiso),
  UNIQUE KEY uq_rol_modulo_permiso (id_rol,id_modulo),
  CONSTRAINT fk_rmp_rol FOREIGN KEY (id_rol) REFERENCES roles(id_rol) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_rmp_modulo FOREIGN KEY (id_modulo) REFERENCES perm_modulos(id_modulo) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_rmp_created_by FOREIGN KEY (created_by) REFERENCES usuarios(id_SB) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT fk_rmp_updated_by FOREIGN KEY (updated_by) REFERENCES usuarios(id_SB) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS rol_elemento_permisos (
  id_rol_elemento_permiso BIGINT NOT NULL AUTO_INCREMENT,
  id_rol BIGINT NOT NULL,
  id_elemento BIGINT NOT NULL,
  permitido TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  created_by BIGINT NULL,
  updated_by BIGINT NULL,
  PRIMARY KEY (id_rol_elemento_permiso),
  UNIQUE KEY uq_rol_elemento_permiso (id_rol,id_elemento),
  CONSTRAINT fk_rep_rol FOREIGN KEY (id_rol) REFERENCES roles(id_rol) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_rep_elemento FOREIGN KEY (id_elemento) REFERENCES perm_elementos(id_elemento) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_rep_created_by FOREIGN KEY (created_by) REFERENCES usuarios(id_SB) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT fk_rep_updated_by FOREIGN KEY (updated_by) REFERENCES usuarios(id_SB) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS usuario_agrupacion_permisos (
  id_usuario_agrupacion_permiso BIGINT NOT NULL AUTO_INCREMENT,
  id_usuario BIGINT NOT NULL,
  id_agrupacion BIGINT NOT NULL,
  permitido TINYINT(1) NOT NULL,
  activo TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  created_by BIGINT NULL,
  updated_by BIGINT NULL,
  PRIMARY KEY (id_usuario_agrupacion_permiso),
  UNIQUE KEY uq_usuario_agrupacion_permiso (id_usuario,id_agrupacion),
  CONSTRAINT fk_uap_usuario FOREIGN KEY (id_usuario) REFERENCES usuarios(id_SB) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_uap_agrupacion FOREIGN KEY (id_agrupacion) REFERENCES perm_agrupaciones(id_agrupacion) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_uap_created_by FOREIGN KEY (created_by) REFERENCES usuarios(id_SB) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT fk_uap_updated_by FOREIGN KEY (updated_by) REFERENCES usuarios(id_SB) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS usuario_modulo_permisos (
  id_usuario_modulo_permiso BIGINT NOT NULL AUTO_INCREMENT,
  id_usuario BIGINT NOT NULL,
  id_modulo BIGINT NOT NULL,
  permitido TINYINT(1) NOT NULL,
  activo TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  created_by BIGINT NULL,
  updated_by BIGINT NULL,
  PRIMARY KEY (id_usuario_modulo_permiso),
  UNIQUE KEY uq_usuario_modulo_permiso (id_usuario,id_modulo),
  CONSTRAINT fk_ump_usuario FOREIGN KEY (id_usuario) REFERENCES usuarios(id_SB) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_ump_modulo FOREIGN KEY (id_modulo) REFERENCES perm_modulos(id_modulo) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_ump_created_by FOREIGN KEY (created_by) REFERENCES usuarios(id_SB) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT fk_ump_updated_by FOREIGN KEY (updated_by) REFERENCES usuarios(id_SB) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS usuario_elemento_permisos (
  id_usuario_elemento_permiso BIGINT NOT NULL AUTO_INCREMENT,
  id_usuario BIGINT NOT NULL,
  id_elemento BIGINT NOT NULL,
  permitido TINYINT(1) NOT NULL,
  activo TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  created_by BIGINT NULL,
  updated_by BIGINT NULL,
  PRIMARY KEY (id_usuario_elemento_permiso),
  UNIQUE KEY uq_usuario_elemento_permiso (id_usuario,id_elemento),
  CONSTRAINT fk_uep_usuario FOREIGN KEY (id_usuario) REFERENCES usuarios(id_SB) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_uep_elemento FOREIGN KEY (id_elemento) REFERENCES perm_elementos(id_elemento) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_uep_created_by FOREIGN KEY (created_by) REFERENCES usuarios(id_SB) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT fk_uep_updated_by FOREIGN KEY (updated_by) REFERENCES usuarios(id_SB) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
