/*
  Sesiones renovables: 90 dias de inactividad y maximo absoluto de 90 dias.

  IMPORTANTE:
  - Este archivo es de bootstrap para instalaciones donde auth_sessions NO exista.
  - NO migra una tabla auth_sessions legacy ya existente.
  - En Aiven actual la tabla ya fue reconciliada y validada el 12/08/2026;
    NO volver a ejecutar DROP/RENAME por esta fase.
  - usuario_id debe ser BIGINT para coincidir con usuarios.id_SB.
*/
USE mydb;

CREATE TABLE IF NOT EXISTS auth_sessions (
  id_session BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  usuario_id BIGINT NOT NULL,
  token_hash CHAR(64) NOT NULL,
  csrf_hash CHAR(64) NOT NULL,
  session_version VARCHAR(64) NOT NULL,
  session_started_at DATETIME(3) NOT NULL,
  last_activity_at DATETIME(3) NOT NULL,
  idle_expires_at DATETIME(3) NOT NULL,
  absolute_expires_at DATETIME(3) NOT NULL,
  revoked_at DATETIME(3) NULL,
  created_ip VARCHAR(64) NULL,
  last_ip VARCHAR(64) NULL,
  user_agent VARCHAR(255) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id_session),
  UNIQUE KEY uq_auth_sessions_token_hash (token_hash),
  KEY idx_auth_sessions_usuario (usuario_id, revoked_at),
  KEY idx_auth_sessions_expiracion (idle_expires_at, absolute_expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
