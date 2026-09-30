USE mydb;

-- Respaldo puntual de los campos legacy que Fase 4 relacionara.
-- No modifica las tablas origen.
CREATE TABLE cobranza_fuente_cor_factura_bak_20260930 AS
SELECT id_fuente_cor,id_proyecto_origen,factura,estatus_factura,moneda,activo
FROM cobranza_fuente_cor;

CREATE TABLE cobranza_aditivas_cor_factura_bak_20260930 AS
SELECT id_aditiva_cor,pp_ns,factura,moneda,activo
FROM cobranza_aditivas_cor;
