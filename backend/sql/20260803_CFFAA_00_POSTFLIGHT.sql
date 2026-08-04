/* ================================================================
   CFFAA-00 — POSTFLIGHT DE VALIDACIÓN
   Solo lectura.
   ================================================================ */

USE mydb;

SELECT
  TABLE_NAME AS tabla,
  COLUMN_NAME AS columna,
  COLUMN_TYPE AS tipo,
  IS_NULLABLE AS permite_null,
  COLUMN_DEFAULT AS valor_default
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND (
    (TABLE_NAME = 'sup_adjuntos' AND COLUMN_NAME IN (
      'storage_provider', 'storage_container', 'storage_blob_name'
    ))
    OR
    (TABLE_NAME = 'pendientes_comentarios_adjuntos' AND COLUMN_NAME IN (
      'storage_provider', 'storage_container', 'storage_blob_name',
      'tamano_bytes', 'subido_por', 'activo', 'updated_at'
    ))
  )
ORDER BY TABLE_NAME, ORDINAL_POSITION;

SELECT
  TABLE_NAME AS tabla,
  INDEX_NAME AS indice,
  SEQ_IN_INDEX AS orden,
  COLUMN_NAME AS columna,
  SUB_PART AS prefijo
FROM information_schema.STATISTICS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME IN ('sup_adjuntos', 'pendientes_comentarios_adjuntos')
  AND INDEX_NAME IN (
    'idx_sup_adjuntos_storage',
    'idx_pca_storage',
    'idx_pca_activo',
    'idx_pca_subido_por'
  )
ORDER BY TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX;

SELECT 'sup_adjuntos' AS tabla, COUNT(*) AS total FROM sup_adjuntos
UNION ALL
SELECT 'pendientes_comentarios_adjuntos', COUNT(*) FROM pendientes_comentarios_adjuntos;

SELECT
  COUNT(*) AS historicos_conservados,
  COALESCE(SUM(storage_provider IS NULL), 0) AS historicos_sin_proveedor,
  COALESCE(SUM(storage_blob_name IS NULL), 0) AS historicos_sin_blob
FROM pendientes_comentarios_adjuntos;
