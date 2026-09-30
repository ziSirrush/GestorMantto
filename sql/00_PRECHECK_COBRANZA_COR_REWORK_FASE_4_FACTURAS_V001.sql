USE mydb;

-- SOLO LECTURA. Ejecutar ANTES de backup/migracion de Fase 4.
SELECT DATABASE() AS base_actual, VERSION() AS mysql_version;

SELECT TABLE_NAME, ENGINE
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME IN ('cobranza_fuente_cor','cobranza_aditivas_cor','cobranza_facturas_cor');

SELECT TABLE_NAME, COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND (
    (TABLE_NAME='cobranza_fuente_cor' AND COLUMN_NAME IN ('id_fuente_cor','id_proyecto_origen','factura','estatus_factura','activo'))
    OR (TABLE_NAME='cobranza_aditivas_cor' AND COLUMN_NAME IN ('id_aditiva_cor','pp_ns','factura','moneda','activo'))
    OR TABLE_NAME='cobranza_facturas_cor'
  )
ORDER BY TABLE_NAME, ORDINAL_POSITION;

SELECT
  SUM(CASE WHEN NULLIF(TRIM(COALESCE(factura,'')),'') IS NOT NULL THEN 1 ELSE 0 END) AS hitos_con_factura_legacy
FROM cobranza_fuente_cor
WHERE activo=1;

SELECT
  SUM(CASE WHEN NULLIF(TRIM(COALESCE(factura,'')),'') IS NOT NULL THEN 1 ELSE 0 END) AS aditivas_con_factura_legacy
FROM cobranza_aditivas_cor
WHERE activo=1;

-- Esperado ANTES de Fase 4:
-- 1) cobranza_fuente_cor y cobranza_aditivas_cor existen.
-- 2) sus IDs/PPNS existen.
-- 3) cobranza_facturas_cor NO existe.
-- Si la tabla ya existe, DETENER y revisar antes de ejecutar la migracion.
