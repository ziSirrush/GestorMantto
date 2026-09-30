USE mydb;

-- SOLO LECTURA. Ejecutar DESPUES de la migracion.
SELECT TABLE_NAME, ENGINE, TABLE_ROWS
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME IN ('cobranza_fuente_cor','cobranza_partidas_cor');

SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME='cobranza_fuente_cor'
  AND COLUMN_NAME='iva_general_pct';

SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME='cobranza_partidas_cor'
ORDER BY ORDINAL_POSITION;

SELECT COUNT(*) AS partidas_activas,
       COUNT(DISTINCT UPPER(TRIM(ppns))) AS ppns_con_partidas
FROM cobranza_partidas_cor
WHERE activo=1;

-- La migracion NO debe crear partidas automaticamente ni inferir IVA historico.
-- Por eso, inmediatamente despues de migrar, se espera partidas_activas=0
-- y los registros existentes de cobranza_fuente_cor con iva_general_pct=NULL.
SELECT COUNT(*) AS hitos_con_iva_general_definido
FROM cobranza_fuente_cor
WHERE activo=1 AND iva_general_pct IS NOT NULL;
