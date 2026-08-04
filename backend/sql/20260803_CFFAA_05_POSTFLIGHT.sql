-- CFFAA-05 - Ventas / Cotizaciones
-- Postflight de solo lectura. No modifica datos ni estructura.
USE mydb;

-- 1. Estructura funcional requerida para comentarios y archivos.
SELECT
  TABLE_NAME,
  COLUMN_NAME,
  COLUMN_TYPE,
  IS_NULLABLE,
  COLUMN_KEY
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME IN ('ventas_cotizaciones_comentarios', 'ventas_cotizaciones_archivos')
ORDER BY TABLE_NAME, ORDINAL_POSITION;

-- 2. Proveedores históricos y actuales.
SELECT
  COALESCE(NULLIF(UPPER(TRIM(storage_provider)), ''), 'SIN_PROVEEDOR') AS proveedor,
  COUNT(*) AS total,
  SUM(CASE WHEN activo = 1 THEN 1 ELSE 0 END) AS activos,
  SUM(CASE WHEN activo = 0 THEN 1 ELSE 0 END) AS inactivos
FROM ventas_cotizaciones_archivos
GROUP BY COALESCE(NULLIF(UPPER(TRIM(storage_provider)), ''), 'SIN_PROVEEDOR')
ORDER BY total DESC, proveedor;

-- 3. Registros Azure activos que no podrían emitir una SAS.
SELECT
  COUNT(*) AS azure_activos_incompletos
FROM ventas_cotizaciones_archivos
WHERE activo = 1
  AND UPPER(TRIM(COALESCE(storage_provider, ''))) = 'AZURE_BLOB'
  AND (
    storage_container IS NULL OR TRIM(storage_container) = ''
    OR storage_blob_name IS NULL OR TRIM(storage_blob_name) = ''
  );

-- 4. Archivos activos vinculados a comentarios inactivos.
-- Después de CFFAA-05 las nuevas bajas deben quedar coordinadas.
SELECT
  COUNT(*) AS archivos_activos_en_comentarios_inactivos
FROM ventas_cotizaciones_archivos a
INNER JOIN ventas_cotizaciones_comentarios c
  ON c.id_comentario = a.id_comentario
WHERE a.activo = 1
  AND c.activo = 0;

-- 5. Comentarios artificiales históricos. Se reportan, no se alteran.
SELECT
  COUNT(*) AS comentarios_artificiales_archivo_adjunto
FROM ventas_cotizaciones_comentarios
WHERE TRIM(comentario) = 'Archivo adjunto';

-- 6. Archivos sin cotización válida. La FK debería mantener este conteo en cero.
SELECT
  COUNT(*) AS archivos_sin_cotizacion
FROM ventas_cotizaciones_archivos a
LEFT JOIN ventas_cotizaciones_cor c
  ON c.id_cotizacion = a.id_cotizacion
WHERE c.id_cotizacion IS NULL;

-- 7. Últimos registros para comprobación funcional.
SELECT
  id_archivo,
  id_cotizacion,
  id_comentario,
  nombre_original,
  mime_type,
  tamanio_bytes,
  storage_provider,
  storage_container,
  storage_blob_name,
  version_numero,
  id_archivo_anterior,
  activo,
  created_at,
  updated_at
FROM ventas_cotizaciones_archivos
ORDER BY id_archivo DESC
LIMIT 20;
