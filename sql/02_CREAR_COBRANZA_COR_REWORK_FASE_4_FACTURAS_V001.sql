USE mydb;

-- FASE 4: Facturas compartidas por Hitos y Aditivas.
-- Pagos NO se crean en esta fase porque su fuente aun no esta definida.
CREATE TABLE cobranza_facturas_cor (
  id_factura_cor BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  ppns VARCHAR(100) NOT NULL,
  tipo_concepto VARCHAR(10) NOT NULL COMMENT 'HITO o ADITIVA',
  id_fuente_cor BIGINT UNSIGNED NULL COMMENT 'Relacion cuando tipo_concepto=HITO',
  id_aditiva_cor BIGINT UNSIGNED NULL COMMENT 'Relacion cuando tipo_concepto=ADITIVA',
  factura VARCHAR(150) NOT NULL,
  fecha_factura DATE NULL,
  moneda VARCHAR(3) NULL,
  subtotal DECIMAL(18,2) NULL,
  iva DECIMAL(18,2) NULL,
  total DECIMAL(18,2) NULL,
  estatus_factura VARCHAR(20) NULL COMMENT 'NULL, No pagado, Pagado',
  fecha_vencimiento DATE NULL,
  estatus_cobranza VARCHAR(30) NULL COMMENT 'Reservado: NULL, En Tiempo, En Cobranza, Cobrado, Vencido; automatico con Pagos en fase posterior',
  origen_registro VARCHAR(20) NOT NULL DEFAULT 'MANUAL' COMMENT 'MANUAL, LEGACY_HITO o LEGACY_ADITIVA',
  activo TINYINT(1) NOT NULL DEFAULT 1,
  created_by BIGINT NULL,
  updated_by BIGINT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id_factura_cor),
  KEY idx_cobranza_facturas_cor_ppns_activo (ppns,activo),
  KEY idx_cobranza_facturas_cor_hito (id_fuente_cor,activo),
  KEY idx_cobranza_facturas_cor_aditiva (id_aditiva_cor,activo),
  KEY idx_cobranza_facturas_cor_folio (factura),
  KEY idx_cobranza_facturas_cor_created_by (created_by),
  KEY idx_cobranza_facturas_cor_updated_by (updated_by)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
