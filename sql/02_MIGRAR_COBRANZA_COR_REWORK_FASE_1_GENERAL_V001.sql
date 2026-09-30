USE mydb;

-- FASE 1: General del Estado de Cuenta.
-- 1) IVA unico del Estado de Cuenta, replicado en los hitos activos por compatibilidad con el modelo actual.
--    Convencion: fraccion decimal. 0.08 = 8%, 0.16 = 16%.
ALTER TABLE cobranza_fuente_cor
  ADD COLUMN iva_general_pct DECIMAL(10,6) NULL
  COMMENT 'IVA general del Estado de Cuenta: NULL, 0, 0.08 o 0.16; fraccion decimal'
  AFTER porcentaje_fondo_garantia;

-- 2) N partidas monetarias base antes de IVA.
--    Se permiten varias filas de la misma moneda; NO existe UNIQUE(ppns, moneda).
CREATE TABLE cobranza_partidas_cor (
  id_partida_cor BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  ppns VARCHAR(100) NOT NULL,
  orden INT UNSIGNED NOT NULL DEFAULT 1,
  moneda VARCHAR(3) NOT NULL,
  monto_base DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  activo TINYINT(1) NOT NULL DEFAULT 1,
  created_by BIGINT NULL,
  updated_by BIGINT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id_partida_cor),
  KEY idx_cobranza_partidas_cor_ppns_activo_orden (ppns, activo, orden),
  KEY idx_cobranza_partidas_cor_moneda (moneda),
  KEY idx_cobranza_partidas_cor_created_by (created_by),
  KEY idx_cobranza_partidas_cor_updated_by (updated_by)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
