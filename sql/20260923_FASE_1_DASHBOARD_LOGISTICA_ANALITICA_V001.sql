-- [Aster | 2026-09-23 | ASTER-MG | FASE 1 DASHBOARD LOGISTICA ANALITICA V001]
-- Objetivo:
--   Incorporar en log_ops los conteos de contenedores que ya existen en la fuente
--   Logistica-Ops como "20' DC" y "40' HQ".
--
-- IMPORTANTE:
--   1) Aplicar primero en laboratorio/restauracion del snapshot.
--   2) Generar respaldo antes de ejecutar en Aiven productivo.
--   3) Este ALTER hace autocommit en MySQL; no existe ROLLBACK transaccional del DDL.
--   4) El rollback estructural se entrega por separado.

USE mydb;

-- PRECHECK: ambas consultas deben devolver 0 filas antes de aplicar esta migracion.
SELECT COLUMN_NAME
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'log_ops'
  AND COLUMN_NAME IN ('contenedores_20_dc', 'contenedores_40_hq');

ALTER TABLE log_ops
  ADD COLUMN contenedores_20_dc INT UNSIGNED NULL
    COMMENT 'Cantidad de contenedores 20 DC proveniente de Logistica-Ops',
  ADD COLUMN contenedores_40_hq INT UNSIGNED NULL
    COMMENT 'Cantidad de contenedores 40 HQ proveniente de Logistica-Ops';

-- POSTCHECK
SELECT
  COLUMN_NAME,
  COLUMN_TYPE,
  IS_NULLABLE,
  COLUMN_COMMENT
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'log_ops'
  AND COLUMN_NAME IN ('contenedores_20_dc', 'contenedores_40_hq')
ORDER BY ORDINAL_POSITION;
