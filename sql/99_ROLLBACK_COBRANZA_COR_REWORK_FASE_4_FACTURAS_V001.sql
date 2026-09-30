USE mydb;

-- ROLLBACK ESTRUCTURAL DE FASE 4.
-- Ejecutar SOLO si no se han capturado Facturas nuevas que deban conservarse.
DROP TABLE IF EXISTS cobranza_facturas_cor;

-- Los respaldos se conservan deliberadamente:
-- cobranza_fuente_cor_factura_bak_20260930
-- cobranza_aditivas_cor_factura_bak_20260930
-- Eliminarlos solo despues de validar la recuperacion y con autorizacion explicita.
