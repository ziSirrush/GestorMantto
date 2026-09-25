-- [Aster | 2026-09-25 | ASTER-MG | FIX INSTALACIONES PVO-PRODUCCION PPNS DIRECTO V002]
-- Objetivo: completar el PPNS propio de logistica_produccion en registros existentes.
-- No crea ni altera tablas/columnas. Es idempotente: solo llena PPNS NULL o vacio.
-- La relacion operativa posterior queda:
-- ins_fl.id_proyecto = logistica_produccion.ppns

SELECT COUNT(*) AS registros_por_completar
FROM logistica_produccion p
INNER JOIN log_ops l ON l.id_log_ops=p.id_log_ops
WHERE (p.ppns IS NULL OR TRIM(p.ppns)='')
  AND l.id_ppns IS NOT NULL
  AND TRIM(l.id_ppns)<>'';

UPDATE logistica_produccion p
INNER JOIN log_ops l ON l.id_log_ops=p.id_log_ops
SET p.ppns=TRIM(l.id_ppns)
WHERE (p.ppns IS NULL OR TRIM(p.ppns)='')
  AND l.id_ppns IS NOT NULL
  AND TRIM(l.id_ppns)<>'';

SELECT ROW_COUNT() AS registros_actualizados;

SELECT COUNT(*) AS registros_aun_sin_ppns
FROM logistica_produccion
WHERE ppns IS NULL OR TRIM(ppns)='';
