USE mydb;

-- [Aster | 2026-09-30 | ASTER-MG | FASE 3 CONSOLIDACION CREAR EDITAR V001]
-- SOLO LECTURA. Cuantifica datos legacy que Fase 3 debe PRESERVAR al editar.

SELECT
  COUNT(*) AS hitos_activos,
  COUNT(DISTINCT id_fuente_cor) AS ids_hito_distintos,
  SUM(NULLIF(TRIM(COALESCE(factura,'')),'') IS NOT NULL) AS hitos_con_factura_legacy,
  SUM(pago_total IS NOT NULL) AS hitos_con_pago_total_legacy,
  SUM(NULLIF(TRIM(COALESCE(estatus_factura,'')),'') IS NOT NULL) AS hitos_con_estatus_factura_legacy,
  SUM(fecha_pago IS NOT NULL) AS hitos_con_fecha_pago_legacy,
  SUM(NULLIF(TRIM(COALESCE(estatus_vencimiento,'')),'') IS NOT NULL) AS hitos_con_estatus_vencimiento_legacy,
  SUM(NULLIF(TRIM(COALESCE(estatus_hito,'')),'') IS NOT NULL) AS hitos_con_estatus_hito_legacy
FROM cobranza_fuente_cor
WHERE activo=1;

SELECT
  COUNT(*) AS aditivas_activas,
  COUNT(DISTINCT id_aditiva_cor) AS ids_aditiva_distintos
FROM cobranza_aditivas_cor
WHERE activo=1;

SELECT ppns, moneda, COUNT(*) AS partidas, SUM(monto_base) AS base_100
FROM cobranza_partidas_cor
WHERE activo=1
GROUP BY ppns, moneda
ORDER BY ppns, moneda;
