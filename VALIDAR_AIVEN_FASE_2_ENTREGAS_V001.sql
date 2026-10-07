-- [Aster | 2026-10-07 | ASTER-MG | FASE 2 ENTREGAS V001]
-- SMOKE SOLO LECTURA. NO INSERTA, ACTUALIZA NI ELIMINA DATOS.
-- Ejecutar sobre la BD Aiven objetivo DESPUES de Fase 0.

SELECT DATABASE() AS base_actual, NOW() AS hora_servidor;

-- 1) Las dos tablas deben existir.
SELECT TABLE_NAME, ENGINE, TABLE_COLLATION, TABLE_ROWS
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME IN ('entregas_programadas','entregas_instancias')
ORDER BY TABLE_NAME;

-- 2) Columnas requeridas. Resultado esperado: 0 filas faltantes.
WITH expected_columns AS (
  SELECT 'entregas_programadas' table_name, 'id_entrega_programada' column_name UNION ALL
  SELECT 'entregas_programadas','id_responsable' UNION ALL
  SELECT 'entregas_programadas','id_colaborador' UNION ALL
  SELECT 'entregas_programadas','titulo' UNION ALL
  SELECT 'entregas_programadas','descripcion' UNION ALL
  SELECT 'entregas_programadas','tipo_recurrencia' UNION ALL
  SELECT 'entregas_programadas','fecha_inicio' UNION ALL
  SELECT 'entregas_programadas','activo' UNION ALL
  SELECT 'entregas_programadas','created_by' UNION ALL
  SELECT 'entregas_programadas','created_at' UNION ALL
  SELECT 'entregas_programadas','updated_at' UNION ALL
  SELECT 'entregas_instancias','id_instancia' UNION ALL
  SELECT 'entregas_instancias','id_entrega_programada' UNION ALL
  SELECT 'entregas_instancias','numero_ocurrencia' UNION ALL
  SELECT 'entregas_instancias','fecha_limite' UNION ALL
  SELECT 'entregas_instancias','fecha_entrega' UNION ALL
  SELECT 'entregas_instancias','nombre_archivo' UNION ALL
  SELECT 'entregas_instancias','mime_type' UNION ALL
  SELECT 'entregas_instancias','tamano_bytes' UNION ALL
  SELECT 'entregas_instancias','storage_provider' UNION ALL
  SELECT 'entregas_instancias','storage_container' UNION ALL
  SELECT 'entregas_instancias','storage_blob_name' UNION ALL
  SELECT 'entregas_instancias','entregado_por' UNION ALL
  SELECT 'entregas_instancias','validado' UNION ALL
  SELECT 'entregas_instancias','validado_por' UNION ALL
  SELECT 'entregas_instancias','fecha_validacion' UNION ALL
  SELECT 'entregas_instancias','comentario_validacion' UNION ALL
  SELECT 'entregas_instancias','created_at' UNION ALL
  SELECT 'entregas_instancias','updated_at'
)
SELECT e.table_name, e.column_name AS columna_faltante
FROM expected_columns e
LEFT JOIN information_schema.COLUMNS c
  ON c.TABLE_SCHEMA = DATABASE()
 AND c.TABLE_NAME = e.table_name
 AND c.COLUMN_NAME = e.column_name
WHERE c.COLUMN_NAME IS NULL
ORDER BY e.table_name, e.column_name;

-- 3) Índices y FKs existentes para inspección.
SELECT TABLE_NAME, INDEX_NAME, NON_UNIQUE,
       GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) AS columnas
FROM information_schema.STATISTICS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME IN ('entregas_programadas','entregas_instancias')
GROUP BY TABLE_NAME, INDEX_NAME, NON_UNIQUE
ORDER BY TABLE_NAME, INDEX_NAME;

SELECT TABLE_NAME, CONSTRAINT_NAME, REFERENCED_TABLE_NAME,
       GROUP_CONCAT(COLUMN_NAME ORDER BY ORDINAL_POSITION) AS columnas
FROM information_schema.KEY_COLUMN_USAGE
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME IN ('entregas_programadas','entregas_instancias')
  AND REFERENCED_TABLE_NAME IS NOT NULL
GROUP BY TABLE_NAME, CONSTRAINT_NAME, REFERENCED_TABLE_NAME
ORDER BY TABLE_NAME, CONSTRAINT_NAME;

-- 4) Catálogo de permisos de Entregas. Deben aparecer los 10 códigos.
SELECT psa.codigo_permiso, psa.activo,
       pa.codigo AS accion,
       ps.codigo AS subelemento,
       pe.codigo AS elemento,
       pm.codigo AS modulo,
       pg.codigo AS agrupacion,
       pg.empresa
FROM perm_subelemento_acciones psa
JOIN perm_acciones pa ON pa.id_accion = psa.id_accion
JOIN perm_subelementos ps ON ps.id_subelemento = psa.id_subelemento
JOIN perm_elementos pe ON pe.id_elemento = ps.id_elemento
JOIN perm_modulos pm ON pm.id_modulo = pe.id_modulo
JOIN perm_agrupaciones pg ON pg.id_agrupacion = pm.id_agrupacion
WHERE psa.codigo_permiso LIKE 'ENTREGAS_CONTROL_%'
ORDER BY psa.codigo_permiso;

-- 5) Concesión del rol 1 (Director General según snapshot de Fase 0).
SELECT psa.codigo_permiso, rp.permitido
FROM rol_permisos rp
JOIN perm_subelemento_acciones psa
  ON psa.id_subelemento_accion = rp.id_subelemento_accion
WHERE rp.id_rol = 1
  AND psa.codigo_permiso LIKE 'ENTREGAS_CONTROL_%'
ORDER BY psa.codigo_permiso;

-- 6) Conteos operativos.
SELECT COUNT(*) AS programadas FROM entregas_programadas;
SELECT COUNT(*) AS instancias FROM entregas_instancias;

-- 7) Consistencia. Cada consulta debería devolver 0.
SELECT COUNT(*) AS instancias_huerfanas
FROM entregas_instancias i
LEFT JOIN entregas_programadas p
  ON p.id_entrega_programada = i.id_entrega_programada
WHERE p.id_entrega_programada IS NULL;

SELECT COUNT(*) AS archivos_azure_incompletos
FROM entregas_instancias
WHERE UPPER(COALESCE(storage_provider,'')) = 'AZURE_BLOB'
  AND (storage_blob_name IS NULL OR TRIM(storage_blob_name) = '');

SELECT COUNT(*) AS entregas_con_archivo_sin_fecha
FROM entregas_instancias
WHERE storage_blob_name IS NOT NULL
  AND TRIM(storage_blob_name) <> ''
  AND fecha_entrega IS NULL;

SELECT COUNT(*) AS validaciones_sin_entrega
FROM entregas_instancias
WHERE validado IS NOT NULL
  AND fecha_entrega IS NULL;

SELECT COUNT(*) AS validaciones_sin_validador
FROM entregas_instancias
WHERE validado IS NOT NULL
  AND validado_por IS NULL;
