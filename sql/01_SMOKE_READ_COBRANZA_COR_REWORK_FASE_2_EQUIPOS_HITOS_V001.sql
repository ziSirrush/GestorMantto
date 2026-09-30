USE mydb;

-- SOLO LECTURA. Revisar bases monetarias de General.
SELECT ppns,moneda,COUNT(*) AS partidas,SUM(monto_base) AS base_100
FROM cobranza_partidas_cor
WHERE activo=1
GROUP BY ppns,moneda
ORDER BY ppns,moneda
LIMIT 100;

-- SOLO LECTURA. Revisar hitos actuales y sus porcentajes por moneda.
SELECT id_proyecto_origen AS ppns,moneda,COUNT(*) AS hitos,SUM(porcentaje) AS suma_porcentaje
FROM cobranza_fuente_cor
WHERE activo=1
GROUP BY id_proyecto_origen,moneda
ORDER BY id_proyecto_origen,moneda
LIMIT 100;

-- SOLO LECTURA. Muestra PHNS crudo que la UI normalizara/separara/deduplicara.
SELECT id_log_ops,id_ppns,ph_ns
FROM log_ops
WHERE NULLIF(TRIM(COALESCE(ph_ns,'')),'') IS NOT NULL
ORDER BY id_log_ops DESC
LIMIT 50;

-- SOLO LECTURA. Diagnostico del caso historico Año NULL/0.
SELECT id_fuente_cor,id_proyecto_origen,orden_hito,anio_proyecto,condicion
FROM cobranza_fuente_cor
WHERE activo=1 AND (anio_proyecto IS NULL OR anio_proyecto=0)
ORDER BY id_proyecto_origen,id_fuente_cor
LIMIT 100;
