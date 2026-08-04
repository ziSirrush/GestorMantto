/* CFFAA-03 — POSTFLIGHT DE SOLO LECTURA */
USE mydb;

SELECT
  TABLE_NAME,
  COLUMN_NAME,
  COLUMN_TYPE,
  IS_NULLABLE,
  COLUMN_DEFAULT
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND (
    (TABLE_NAME = 'sup_tickets' AND COLUMN_NAME = 'empresa')
    OR
    (TABLE_NAME = 'sup_adjuntos' AND COLUMN_NAME IN (
      'storage_provider', 'storage_container', 'storage_blob_name'
    ))
  )
ORDER BY TABLE_NAME, ORDINAL_POSITION;

SELECT
  TABLE_NAME,
  INDEX_NAME,
  GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX SEPARATOR ', ') AS columnas
FROM information_schema.STATISTICS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME IN ('sup_tickets', 'sup_adjuntos')
  AND INDEX_NAME IN ('idx_sup_tickets_empresa', 'idx_sup_adjuntos_storage')
GROUP BY TABLE_NAME, INDEX_NAME
ORDER BY TABLE_NAME, INDEX_NAME;

SELECT
  COUNT(*) AS total_solicitudes,
  SUM(CASE WHEN empresa IS NULL OR TRIM(empresa) = '' THEN 1 ELSE 0 END) AS solicitudes_sin_empresa,
  SUM(CASE WHEN empresa IS NOT NULL AND TRIM(empresa) <> '' THEN 1 ELSE 0 END) AS solicitudes_con_empresa
FROM sup_tickets;

SELECT
  COALESCE(NULLIF(TRIM(empresa), ''), '(SIN EMPRESA)') AS empresa,
  COUNT(*) AS solicitudes
FROM sup_tickets
GROUP BY COALESCE(NULLIF(TRIM(empresa), ''), '(SIN EMPRESA)')
ORDER BY solicitudes DESC, empresa ASC;

SELECT
  COALESCE(NULLIF(UPPER(TRIM(storage_provider)), ''), '(SIN PROVEEDOR)') AS proveedor,
  COUNT(*) AS adjuntos
FROM sup_adjuntos
GROUP BY COALESCE(NULLIF(UPPER(TRIM(storage_provider)), ''), '(SIN PROVEEDOR)')
ORDER BY adjuntos DESC, proveedor ASC;

SELECT
  id_ticket,
  folio,
  id_usuario,
  empresa
FROM sup_tickets
WHERE empresa IS NULL OR TRIM(empresa) = ''
ORDER BY id_ticket ASC
LIMIT 100;
