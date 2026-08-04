-- CFFAA-04 - Ventas / Prospeccion
-- Postflight de solo lectura. No modifica datos ni estructura.
USE mydb;

SELECT
  TABLE_NAME,
  COLUMN_NAME,
  COLUMN_TYPE,
  IS_NULLABLE,
  COLUMN_DEFAULT
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'ventas_prospeccion_archivos'
  AND COLUMN_NAME IN (
    'id_archivo', 'id_pros', 'id_com_pors', 'tipo_relacion',
    'nombre_archivo', 'nombre_original', 'mime_type', 'extension',
    'tamano_bytes', 'storage_provider', 'storage_url',
    'storage_container', 'storage_blob_name', 'thumbnail_url',
    'orden', 'es_imagen', 'activo', 'created_at', 'updated_at'
  )
ORDER BY ORDINAL_POSITION;

SELECT
  UPPER(COALESCE(NULLIF(TRIM(storage_provider), ''), '(SIN_PROVEEDOR)')) AS proveedor,
  COUNT(*) AS total,
  SUM(activo = 1) AS activos,
  SUM(activo = 0) AS inactivos
FROM ventas_prospeccion_archivos
GROUP BY UPPER(COALESCE(NULLIF(TRIM(storage_provider), ''), '(SIN_PROVEEDOR)'))
ORDER BY total DESC, proveedor;

SELECT
  COUNT(*) AS azure_total,
  SUM(storage_container IS NULL OR TRIM(storage_container) = '') AS azure_sin_contenedor,
  SUM(storage_blob_name IS NULL OR TRIM(storage_blob_name) = '') AS azure_sin_blob,
  SUM(storage_url IS NULL OR TRIM(storage_url) = '') AS azure_sin_url_estable
FROM ventas_prospeccion_archivos
WHERE UPPER(TRIM(storage_provider)) = 'AZURE_BLOB';

-- Detecta registros posiblemente creados por la implementacion anterior,
-- que etiquetaba GOOGLE_DRIVE aunque recibiera un blob de Azure. No corrige
-- automaticamente porque la evidencia debe revisarse antes de reclasificarla.
SELECT
  COUNT(*) AS posibles_azure_mal_etiquetados
FROM ventas_prospeccion_archivos
WHERE UPPER(TRIM(storage_provider)) = 'GOOGLE_DRIVE'
  AND storage_blob_name IS NOT NULL
  AND TRIM(storage_blob_name) <> '';

SELECT
  id_archivo,
  id_pros,
  id_com_pors,
  tipo_relacion,
  nombre_original,
  storage_provider,
  storage_container,
  storage_blob_name,
  activo,
  created_at
FROM ventas_prospeccion_archivos
WHERE UPPER(TRIM(storage_provider)) = 'AZURE_BLOB'
ORDER BY id_archivo DESC
LIMIT 20;
