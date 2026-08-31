/* =====================================================================
   CFFAA-06 — POSTFLIGHT DE CONCILIACION Y CIERRE
   Solo lectura. No modifica estructura, registros ni blobs.
   ===================================================================== */

USE mydb;

-- 1. Estructura de la bitacora tecnica.
SELECT
  COLUMN_NAME,
  COLUMN_TYPE,
  IS_NULLABLE,
  COLUMN_DEFAULT,
  COLUMN_KEY
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'storage_eventos'
ORDER BY ORDINAL_POSITION;

-- 2. Indices requeridos.
SELECT
  INDEX_NAME,
  NON_UNIQUE,
  GROUP_CONCAT(
    CONCAT(COLUMN_NAME, IF(SUB_PART IS NULL, '', CONCAT('(', SUB_PART, ')')))
    ORDER BY SEQ_IN_INDEX SEPARATOR ', '
  ) AS columnas
FROM information_schema.STATISTICS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'storage_eventos'
GROUP BY INDEX_NAME, NON_UNIQUE
ORDER BY INDEX_NAME;

-- 3. Inventario consolidado por proveedor y tabla funcional.
SELECT 'pendientes_archivos' AS tabla,
       COALESCE(NULLIF(UPPER(TRIM(storage_provider)), ''), '(SIN_PROVEEDOR)') AS proveedor,
       COUNT(*) AS total,
       SUM(CASE WHEN activo = 1 THEN 1 ELSE 0 END) AS activos,
       SUM(CASE WHEN activo = 0 THEN 1 ELSE 0 END) AS inactivos
FROM pendientes_archivos
GROUP BY proveedor
UNION ALL
SELECT 'pendientes_comentarios_adjuntos',
       COALESCE(NULLIF(UPPER(TRIM(storage_provider)), ''), '(SIN_PROVEEDOR)'),
       COUNT(*),
       SUM(CASE WHEN COALESCE(activo, 1) = 1 THEN 1 ELSE 0 END),
       SUM(CASE WHEN COALESCE(activo, 1) = 0 THEN 1 ELSE 0 END)
FROM pendientes_comentarios_adjuntos
GROUP BY COALESCE(NULLIF(UPPER(TRIM(storage_provider)), ''), '(SIN_PROVEEDOR)')
UNION ALL
SELECT 'sup_adjuntos',
       COALESCE(NULLIF(UPPER(TRIM(storage_provider)), ''), '(SIN_PROVEEDOR)'),
       COUNT(*),
       SUM(CASE WHEN COALESCE(activo, 1) = 1 THEN 1 ELSE 0 END),
       SUM(CASE WHEN COALESCE(activo, 1) = 0 THEN 1 ELSE 0 END)
FROM sup_adjuntos
GROUP BY COALESCE(NULLIF(UPPER(TRIM(storage_provider)), ''), '(SIN_PROVEEDOR)')
UNION ALL
SELECT 'ventas_prospeccion_archivos',
       COALESCE(NULLIF(UPPER(TRIM(storage_provider)), ''), '(SIN_PROVEEDOR)'),
       COUNT(*),
       SUM(CASE WHEN activo = 1 THEN 1 ELSE 0 END),
       SUM(CASE WHEN activo = 0 THEN 1 ELSE 0 END)
FROM ventas_prospeccion_archivos
GROUP BY COALESCE(NULLIF(UPPER(TRIM(storage_provider)), ''), '(SIN_PROVEEDOR)')
UNION ALL
SELECT 'ventas_cotizaciones_archivos',
       COALESCE(NULLIF(UPPER(TRIM(storage_provider)), ''), '(SIN_PROVEEDOR)'),
       COUNT(*),
       SUM(CASE WHEN activo = 1 THEN 1 ELSE 0 END),
       SUM(CASE WHEN activo = 0 THEN 1 ELSE 0 END)
FROM ventas_cotizaciones_archivos
GROUP BY COALESCE(NULLIF(UPPER(TRIM(storage_provider)), ''), '(SIN_PROVEEDOR)')
ORDER BY tabla, total DESC, proveedor;

-- 4. Referencias Azure activas incompletas: no podrian emitir una SAS.
SELECT 'pendientes_archivos' AS tabla, COUNT(*) AS azure_activos_incompletos
FROM pendientes_archivos
WHERE activo = 1
  AND UPPER(TRIM(COALESCE(storage_provider, ''))) = 'AZURE_BLOB'
  AND (storage_container IS NULL OR TRIM(storage_container) = '' OR storage_blob_name IS NULL OR TRIM(storage_blob_name) = '')
UNION ALL
SELECT 'pendientes_comentarios_adjuntos', COUNT(*)
FROM pendientes_comentarios_adjuntos
WHERE COALESCE(activo, 1) = 1
  AND UPPER(TRIM(COALESCE(storage_provider, ''))) = 'AZURE_BLOB'
  AND (storage_container IS NULL OR TRIM(storage_container) = '' OR storage_blob_name IS NULL OR TRIM(storage_blob_name) = '')
UNION ALL
SELECT 'sup_adjuntos', COUNT(*)
FROM sup_adjuntos
WHERE COALESCE(activo, 1) = 1
  AND UPPER(TRIM(COALESCE(storage_provider, ''))) = 'AZURE_BLOB'
  AND (storage_container IS NULL OR TRIM(storage_container) = '' OR storage_blob_name IS NULL OR TRIM(storage_blob_name) = '')
UNION ALL
SELECT 'ventas_prospeccion_archivos', COUNT(*)
FROM ventas_prospeccion_archivos
WHERE activo = 1
  AND UPPER(TRIM(COALESCE(storage_provider, ''))) = 'AZURE_BLOB'
  AND (storage_container IS NULL OR TRIM(storage_container) = '' OR storage_blob_name IS NULL OR TRIM(storage_blob_name) = '')
UNION ALL
SELECT 'ventas_cotizaciones_archivos', COUNT(*)
FROM ventas_cotizaciones_archivos
WHERE activo = 1
  AND UPPER(TRIM(COALESCE(storage_provider, ''))) = 'AZURE_BLOB'
  AND (storage_container IS NULL OR TRIM(storage_container) = '' OR storage_blob_name IS NULL OR TRIM(storage_blob_name) = '');

-- 5. Estado de la cola de eliminaciones.
SELECT estado, COUNT(*) AS total
FROM storage_operaciones_pendientes
GROUP BY estado
ORDER BY estado;

-- 6. Metricas registradas durante los ultimos 30 dias.
SELECT tipo_evento, COUNT(*) AS total, COALESCE(SUM(tamano_bytes), 0) AS total_bytes
FROM storage_eventos
WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
GROUP BY tipo_evento
ORDER BY tipo_evento;

-- 7. Referencias historicas conocidas bajo /uploads.
SELECT 'pendientes.photo_url' AS origen, COUNT(*) AS referencias
FROM pendientes
WHERE photo_url LIKE '%/uploads/%' OR photo_url LIKE 'uploads/%'
UNION ALL
SELECT 'pendientes.adjunto_url', COUNT(*)
FROM pendientes
WHERE adjunto_url LIKE '%/uploads/%' OR adjunto_url LIKE 'uploads/%'
UNION ALL
SELECT 'pendientes_comentarios_adjuntos.archivo_url', COUNT(*)
FROM pendientes_comentarios_adjuntos
WHERE archivo_url LIKE '%/uploads/%' OR archivo_url LIKE 'uploads/%'
UNION ALL
SELECT 'sup_adjuntos.ruta_archivo', COUNT(*)
FROM sup_adjuntos
WHERE ruta_archivo LIKE '%/uploads/%' OR ruta_archivo LIKE 'uploads/%'
UNION ALL
SELECT 'servicios_preventivos.evidencia_url', COUNT(*)
FROM servicios_preventivos
WHERE evidencia_url LIKE '%/uploads/%' OR evidencia_url LIKE 'uploads/%';

-- 8. Eventos recientes sin exponer URLs SAS ni credenciales.
SELECT
  id_evento,
  tipo_evento,
  storage_provider,
  storage_container,
  storage_blob_name,
  modulo,
  entidad_tipo,
  entidad_id,
  archivo_id,
  usuario_id,
  codigo,
  tamano_bytes,
  created_at
FROM storage_eventos
ORDER BY id_evento DESC
LIMIT 50;
