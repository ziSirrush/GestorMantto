/* =====================================================================
   CFFAA-06 — CONCILIACION, METRICAS Y CIERRE DE STORAGE
   Proyecto: Mantto Gestor
   Motor: MySQL 8.4.x

   Alcance:
   - Crea una bitacora tecnica de eventos de Storage.
   - No reemplaza tablas funcionales de adjuntos.
   - No migra historicos ni elimina blobs.
   - No crea llaves foraneas para conservar evidencia aun cuando una
     entidad o usuario se elimine posteriormente.
   ===================================================================== */

USE mydb;

CREATE TABLE IF NOT EXISTS storage_eventos (
  id_evento BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tipo_evento VARCHAR(40) NOT NULL,
  storage_provider VARCHAR(30) NULL,
  storage_container VARCHAR(150) NULL,
  storage_blob_name VARCHAR(1024) NULL,
  modulo VARCHAR(100) NULL,
  entidad_tipo VARCHAR(100) NULL,
  entidad_id VARCHAR(150) NULL,
  archivo_id VARCHAR(150) NULL,
  usuario_id INT NULL,
  codigo VARCHAR(100) NULL,
  tamano_bytes BIGINT UNSIGNED NULL,
  http_method VARCHAR(10) NULL,
  request_path VARCHAR(255) NULL,
  detalle_json JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id_evento),
  KEY idx_storage_eventos_tipo_fecha (tipo_evento, created_at),
  KEY idx_storage_eventos_modulo_fecha (modulo, created_at),
  KEY idx_storage_eventos_usuario_fecha (usuario_id, created_at),
  KEY idx_storage_eventos_blob (storage_provider, storage_blob_name(191)),
  KEY idx_storage_eventos_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

SELECT 'CFFAA-06: tabla storage_eventos lista. Ejecuta el postflight.' AS resultado;
