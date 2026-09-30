USE mydb;

-- SOLO LECTURA. Ejecutar DESPUES de crear/migrar Fase 4.
SELECT COUNT(*) AS facturas_activas,
       SUM(tipo_concepto='HITO') AS facturas_hito,
       SUM(tipo_concepto='ADITIVA') AS facturas_aditiva,
       SUM(origen_registro='LEGACY_HITO') AS migradas_hito,
       SUM(origen_registro='LEGACY_ADITIVA') AS migradas_aditiva,
       SUM(origen_registro='MANUAL') AS manuales
FROM cobranza_facturas_cor
WHERE activo=1;

SELECT COUNT(*) AS relaciones_hito_huerfanas
FROM cobranza_facturas_cor cf
LEFT JOIN cobranza_fuente_cor f ON f.id_fuente_cor=cf.id_fuente_cor
WHERE cf.activo=1 AND cf.tipo_concepto='HITO'
  AND (cf.id_fuente_cor IS NULL OR cf.id_aditiva_cor IS NOT NULL OR f.id_fuente_cor IS NULL);

SELECT COUNT(*) AS relaciones_aditiva_huerfanas
FROM cobranza_facturas_cor cf
LEFT JOIN cobranza_aditivas_cor a ON a.id_aditiva_cor=cf.id_aditiva_cor
WHERE cf.activo=1 AND cf.tipo_concepto='ADITIVA'
  AND (cf.id_aditiva_cor IS NULL OR cf.id_fuente_cor IS NOT NULL OR a.id_aditiva_cor IS NULL);

SELECT tipo_concepto,estatus_factura,estatus_cobranza,COUNT(*) AS registros
FROM cobranza_facturas_cor
WHERE activo=1
GROUP BY tipo_concepto,estatus_factura,estatus_cobranza
ORDER BY tipo_concepto,estatus_factura,estatus_cobranza;
