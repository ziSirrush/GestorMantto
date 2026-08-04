/* =====================================================================
   CFFAA-02 — POSTFLIGHT HOME / PENDIENTES
   Solo lectura.
   ===================================================================== */

USE mydb;

SELECT
  TABLE_NAME AS tabla,
  COLUMN_NAME AS columna,
  COLUMN_TYPE AS tipo,
  IS_NULLABLE AS permite_null,
  COLUMN_DEFAULT AS valor_default,
  EXTRA AS extra
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND (
    (TABLE_NAME = 'pendientes' AND COLUMN_NAME = 'empresa')
    OR
    (TABLE_NAME = 'pendientes_archivos' AND COLUMN_NAME IN (
      'id_archivo', 'id_pendiente', 'tipo_archivo', 'nombre_original',
      'mime_type', 'tamano_bytes', 'storage_provider', 'storage_container',
      'storage_blob_name', 'storage_url', 'origen_archivo', 'subido_por',
      'activo', 'eliminado_por', 'eliminado_at', 'motivo_baja',
      'created_at', 'updated_at'
    ))
  )
ORDER BY TABLE_NAME, ORDINAL_POSITION;

SELECT
  TABLE_NAME AS tabla,
  INDEX_NAME AS indice,
  NON_UNIQUE AS no_unico,
  SEQ_IN_INDEX AS orden,
  COLUMN_NAME AS columna,
  SUB_PART AS prefijo
FROM information_schema.STATISTICS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME IN ('pendientes', 'pendientes_archivos')
  AND INDEX_NAME IN (
    'idx_pendientes_empresa',
    'idx_pendientes_archivos_tarea',
    'idx_pendientes_archivos_tipo',
    'idx_pendientes_archivos_storage',
    'idx_pendientes_archivos_subido',
    'idx_pendientes_archivos_eliminado'
  )
ORDER BY TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX;

SELECT
  kcu.TABLE_NAME AS tabla,
  kcu.CONSTRAINT_NAME AS restriccion,
  kcu.COLUMN_NAME AS columna,
  kcu.REFERENCED_TABLE_NAME AS tabla_referenciada,
  kcu.REFERENCED_COLUMN_NAME AS columna_referenciada,
  rc.DELETE_RULE AS regla_eliminacion,
  rc.UPDATE_RULE AS regla_actualizacion
FROM information_schema.KEY_COLUMN_USAGE kcu
INNER JOIN information_schema.REFERENTIAL_CONSTRAINTS rc
  ON rc.CONSTRAINT_SCHEMA = kcu.CONSTRAINT_SCHEMA
 AND rc.TABLE_NAME = kcu.TABLE_NAME
 AND rc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME
WHERE kcu.TABLE_SCHEMA = DATABASE()
  AND kcu.TABLE_NAME = 'pendientes_archivos'
ORDER BY kcu.CONSTRAINT_NAME;

SELECT
  COUNT(*) AS total_pendientes,
  COALESCE(SUM(empresa IS NOT NULL AND TRIM(empresa) <> ''), 0) AS pendientes_con_empresa,
  COALESCE(SUM(empresa IS NULL OR TRIM(empresa) = ''), 0) AS pendientes_sin_empresa,
  COALESCE(SUM(photo_url IS NOT NULL AND TRIM(photo_url) <> ''), 0) AS fotos_legacy_conservadas,
  COALESCE(SUM(adjunto_url IS NOT NULL AND TRIM(adjunto_url) <> ''), 0) AS adjuntos_legacy_conservados
FROM pendientes;

SELECT
  COUNT(*) AS total_archivos,
  COALESCE(SUM(activo = 1), 0) AS activos,
  COALESCE(SUM(activo = 0), 0) AS inactivos,
  COALESCE(SUM(storage_provider = 'AZURE_BLOB'), 0) AS azure_blob
FROM pendientes_archivos;
