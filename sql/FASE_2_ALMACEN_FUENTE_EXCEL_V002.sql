-- [Aster | 2026-08-30 | ASTER-MG | FASE 2 ALMACEN DATOS EXCEL V002]
-- OBJETIVO: una sola tabla temporal de staging/consulta mientras se liberan las BG.
-- NO borra datos previos. Cada importacion crea un lote; solo un lote queda activo.

CREATE TABLE IF NOT EXISTS almacen_fuente_excel (
  id BIGINT NOT NULL AUTO_INCREMENT,
  lote_importacion CHAR(36) NOT NULL,
  archivo_origen VARCHAR(255) NOT NULL,
  hoja_origen VARCHAR(255) NULL,
  fila_origen INT NOT NULL,
  fecha_corte DATE NULL,
  fecha_importacion DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  activo TINYINT(1) NOT NULL DEFAULT 0,
  hash_archivo CHAR(64) NOT NULL,
  hash_fila CHAR(64) NOT NULL,
  encabezados_json JSON NULL,
  mapeo_json JSON NULL,

  codigo VARCHAR(255) NULL,
  articulo VARCHAR(500) NULL,
  categoria VARCHAR(255) NULL,
  empresa VARCHAR(255) NULL,
  almacen VARCHAR(255) NULL,
  tipo_almacen VARCHAR(120) NULL,
  fisico DECIMAL(20,4) NULL,
  precio_unitario DECIMAL(20,6) NULL,
  valor DECIMAL(20,4) NULL,

  raw_json JSON NOT NULL,
  creado_por BIGINT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),

  PRIMARY KEY (id),
  UNIQUE KEY uq_almacen_excel_lote_fila (lote_importacion, fila_origen),
  KEY idx_almacen_excel_activo (activo, fecha_importacion),
  KEY idx_almacen_excel_empresa (activo, empresa),
  KEY idx_almacen_excel_almacen (activo, almacen),
  KEY idx_almacen_excel_categoria (activo, categoria),
  KEY idx_almacen_excel_codigo (activo, codigo),
  KEY idx_almacen_excel_articulo (activo, articulo(191)),
  KEY idx_almacen_excel_lote (lote_importacion)
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;

-- VALIDACION ESTRUCTURAL
SELECT TABLE_NAME, TABLE_ROWS
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'almacen_fuente_excel';

SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'almacen_fuente_excel'
ORDER BY ORDINAL_POSITION;
