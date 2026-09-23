-- [Aster | 2026-09-23 | ASTER-MG | ROLLBACK FASE 1 DASHBOARD LOGISTICA ANALITICA V001]
-- ADVERTENCIA:
--   Este rollback elimina los valores sincronizados en las dos columnas nuevas.
--   Usar solo si se decide revertir completamente la FASE 1 y existe respaldo.

USE mydb;

ALTER TABLE log_ops
  DROP COLUMN contenedores_20_dc,
  DROP COLUMN contenedores_40_hq;
