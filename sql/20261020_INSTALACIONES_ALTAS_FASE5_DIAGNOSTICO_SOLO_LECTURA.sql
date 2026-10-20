-- BLT NOW | 2026-10-20 | ALTAS FASE 5 V001
-- EXCLUSIVAMENTE SELECT / SHOW. Ejecutar preferiblemente en restauracion
-- reciente; Aiven actual es autoridad. NO incluye INSERT/UPDATE/ALTER/DELETE.

-- 1. Esquema vigente y NULLs permitidos: comprobar antes de liberar POST.
SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT, COLUMN_KEY
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ins_fl'
ORDER BY ORDINAL_POSITION;

-- 2. Restriccion UNIQUE compuesta realmente disponible.
SHOW INDEX FROM ins_fl WHERE Key_name = 'uq_ins_fl_proyecto_referencia';

-- 3. Total e identidades incompletas, sin revelar informacion personal.
SELECT COUNT(*) AS total_equipos,
       SUM(id_proyecto IS NULL OR TRIM(id_proyecto) = '') AS sin_pp_ns,
       SUM(referencia_sitio IS NULL OR TRIM(referencia_sitio) = '') AS sin_referencia,
       SUM(proyecto IS NULL OR TRIM(proyecto) = '') AS sin_nombre_proyecto
FROM ins_fl;

-- 4. Un mismo PP NS asociado con mas de un nombre (revision, no autocorregir).
SELECT id_proyecto, COUNT(*) AS equipos,
       COUNT(DISTINCT UPPER(TRIM(COALESCE(proyecto,'')))) AS nombres_distintos
FROM ins_fl
WHERE id_proyecto IS NOT NULL AND TRIM(id_proyecto) <> ''
GROUP BY id_proyecto
HAVING nombres_distintos > 1
ORDER BY equipos DESC
LIMIT 50;

-- 5. Numero de altas humanas auditadas. NO equivale al total de filas actuales
-- y no sustituye la reconciliacion documental o la comprobacion de FKs.
SELECT COUNT(*) AS auditorias_alta,
       COUNT(DISTINCT JSON_UNQUOTE(JSON_EXTRACT(payload_json, '$.id_ins_fl'))) AS ids_distintos
FROM usuario_interacciones
WHERE modulo = 'instalaciones-administracion'
  AND entidad = 'proyecto_instalaciones'
  AND tipo_interaccion = 'CREAR'
  AND metodo_http = 'POST';

-- 6. Auditorias con ID o PP NS vacios: requieren investigacion antes de liberar.
SELECT COUNT(*) AS auditorias_sin_identidad
FROM usuario_interacciones
WHERE modulo = 'instalaciones-administracion'
  AND entidad = 'proyecto_instalaciones'
  AND tipo_interaccion = 'CREAR'
  AND metodo_http = 'POST'
  AND (id_referencia IS NULL OR id_referencia = ''
       OR JSON_UNQUOTE(JSON_EXTRACT(payload_json, '$.id_ins_fl')) IS NULL);
