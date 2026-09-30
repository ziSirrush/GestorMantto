USE mydb;

-- SOLO LECTURA. Ejecutar ANTES de backup/migracion.
SELECT DATABASE() AS base_actual, VERSION() AS mysql_version;

SELECT TABLE_NAME, ENGINE
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME IN ('cobranza_fuente_cor','cobranza_partidas_cor');

SELECT TABLE_NAME, COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND (
    (TABLE_NAME='cobranza_fuente_cor' AND COLUMN_NAME IN ('id_fuente_cor','id_proyecto_origen','porcentaje_fondo_garantia','iva_general_pct','activo'))
    OR TABLE_NAME='cobranza_partidas_cor'
  )
ORDER BY TABLE_NAME, ORDINAL_POSITION;

-- Esperado ANTES de Fase 1:
-- 1) cobranza_fuente_cor existe.
-- 2) cobranza_partidas_cor NO existe.
-- 3) cobranza_fuente_cor.iva_general_pct NO existe.
