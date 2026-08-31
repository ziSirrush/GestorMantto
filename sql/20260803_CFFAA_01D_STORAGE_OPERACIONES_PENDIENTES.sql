/* ================================================================
   CFFAA-01D — COLA TÉCNICA DE OPERACIONES PENDIENTES DE STORAGE
   Proyecto: Mantto Gestor
   Motor validado: MySQL 8.4.x

   Características:
   - Idempotente mediante CREATE TABLE IF NOT EXISTS.
   - No reemplaza ni unifica las tablas funcionales de adjuntos.
   - No utiliza llaves foráneas para conservar la operación aun cuando
     la entidad o el usuario original sean eliminados.
   ================================================================ */

USE mydb;

CREATE TABLE IF NOT EXISTS storage_operaciones_pendientes (
  id_operacion BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  dedup_key CHAR(64) NOT NULL,
  tipo_operacion VARCHAR(40) NOT NULL,
  storage_provider VARCHAR(30) NOT NULL DEFAULT 'AZURE_BLOB',
  storage_container VARCHAR(150) NULL,
  storage_blob_name VARCHAR(1024) NOT NULL,
  modulo VARCHAR(100) NULL,
  entidad_tipo VARCHAR(100) NULL,
  entidad_id VARCHAR(150) NULL,
  motivo VARCHAR(255) NULL,
  solicitado_por INT NULL,
  estado ENUM('PENDIENTE','PROCESANDO','ERROR','COMPLETADA','DESCARTADA') NOT NULL DEFAULT 'PENDIENTE',
  intentos INT UNSIGNED NOT NULL DEFAULT 0,
  max_intentos INT UNSIGNED NOT NULL DEFAULT 10,
  proximo_intento DATETIME NULL DEFAULT CURRENT_TIMESTAMP,
  ultimo_intento_at DATETIME NULL,
  ultimo_error TEXT NULL,
  completed_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id_operacion),
  UNIQUE KEY uq_storage_operaciones_dedup (dedup_key),
  KEY idx_storage_operaciones_ciclo (estado, proximo_intento, id_operacion),
  KEY idx_storage_operaciones_entidad (modulo, entidad_tipo, entidad_id),
  KEY idx_storage_operaciones_created (created_at),
  KEY idx_storage_operaciones_blob (storage_provider, storage_blob_name(191))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

SELECT 'CFFAA-01D: tabla storage_operaciones_pendientes lista. Ejecuta el postflight.' AS resultado;
