USE mydb;

-- ROLLBACK DE ESQUEMA.
-- ADVERTENCIA: DROP TABLE elimina cualquier partida creada despues del despliegue.
-- Usar solo tras respaldar/exportar esos datos si ya hubo operacion real.
DROP TABLE IF EXISTS cobranza_partidas_cor;

ALTER TABLE cobranza_fuente_cor
  DROP COLUMN iva_general_pct;

-- El backup bk_20260929_cobranza_fuente_cor_f1 se conserva deliberadamente.
-- No se elimina de forma automatica.
