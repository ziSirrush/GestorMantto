USE mydb;

-- BACKUP ESTRUCTURAL + DATOS de la unica tabla existente que sera alterada.
-- Este script debe ejecutarse UNA sola vez. Si la tabla de backup ya existe, DETENERSE y revisar.
CREATE TABLE bk_20260929_cobranza_fuente_cor_f1 LIKE cobranza_fuente_cor;
INSERT INTO bk_20260929_cobranza_fuente_cor_f1
SELECT * FROM cobranza_fuente_cor;

SELECT COUNT(*) AS filas_origen FROM cobranza_fuente_cor;
SELECT COUNT(*) AS filas_backup FROM bk_20260929_cobranza_fuente_cor_f1;
