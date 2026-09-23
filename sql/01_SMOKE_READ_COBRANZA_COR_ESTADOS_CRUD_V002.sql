USE mydb;

-- SOLO LECTURA.
-- Smoke de relaciones necesarias para Crear/Editar.

SELECT
    COUNT(*) AS fuente_activa,
    COUNT(DISTINCT UPPER(TRIM(id_proyecto_origen))) AS ppns_con_estado_cuenta
FROM cobranza_fuente_cor
WHERE activo = 1
  AND NULLIF(TRIM(COALESCE(id_proyecto_origen, '')), '') IS NOT NULL;

SELECT
    COUNT(*) AS equipos_cor_activos,
    COUNT(DISTINCT UPPER(TRIM(ppns))) AS ppns_con_equipos_cor
FROM cobranza_equipos_cor
WHERE activo = 1;

SELECT
    COUNT(*) AS relaciones_huerfanas_ins_fl
FROM cobranza_equipos_cor ce
LEFT JOIN ins_fl fl ON fl.id_ins_fl = ce.id_ins_fl
WHERE ce.activo = 1
  AND ce.id_ins_fl IS NOT NULL
  AND fl.id_ins_fl IS NULL;

SELECT
    COUNT(*) AS relaciones_huerfanas_log_ops
FROM cobranza_equipos_cor ce
LEFT JOIN log_ops lo ON lo.id_log_ops = ce.id_log_ops
WHERE ce.activo = 1
  AND ce.id_log_ops IS NOT NULL
  AND lo.id_log_ops IS NULL;
