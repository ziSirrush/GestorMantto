-- [Aster | 2026-08-28 | ASTER-MG | FASE_5_SQL_AIVEN_OPTIMIZACION_V001]
-- PRECHECK DE SOLO LECTURA. NO MODIFICA AIVEN.
-- Objetivo: validar esquema/indices antes de aplicar cualquier DDL de Fase 5.

SELECT
  DATABASE() AS esquema_actual,
  @@version AS mysql_version,
  @@version_comment AS mysql_distribucion,
  NOW() AS fecha_servidor;

SELECT
  t.TABLE_NAME,
  t.TABLE_ROWS AS filas_estimadas,
  ROUND(t.DATA_LENGTH / 1024 / 1024, 2) AS data_mb,
  ROUND(t.INDEX_LENGTH / 1024 / 1024, 2) AS index_mb
FROM information_schema.TABLES t
WHERE t.TABLE_SCHEMA = DATABASE()
  AND t.TABLE_NAME IN (
    'sup_notificaciones',
    'notificaciones_push_suscripciones',
    'usuario_zop',
    'ventas_prospecciones',
    'tickets'
  )
ORDER BY t.TABLE_NAME;

-- Inventario exacto de indices de las tablas intervenidas/profiladas.
SELECT
  s.TABLE_NAME,
  s.INDEX_NAME,
  s.NON_UNIQUE,
  GROUP_CONCAT(
    CASE
      WHEN s.SUB_PART IS NULL THEN s.COLUMN_NAME
      ELSE CONCAT(s.COLUMN_NAME, '(', s.SUB_PART, ')')
    END
    ORDER BY s.SEQ_IN_INDEX
    SEPARATOR ','
  ) AS columnas
FROM information_schema.STATISTICS s
WHERE s.TABLE_SCHEMA = DATABASE()
  AND s.TABLE_NAME IN (
    'sup_notificaciones',
    'notificaciones_push_suscripciones',
    'usuario_zop',
    'ventas_prospecciones',
    'tickets'
  )
GROUP BY s.TABLE_NAME, s.INDEX_NAME, s.NON_UNIQUE
ORDER BY s.TABLE_NAME, s.INDEX_NAME;

-- Detecta indices con exactamente la misma secuencia de columnas.
-- El resultado es diagnostico: no elimina nada.
WITH indices AS (
  SELECT
    s.TABLE_NAME,
    s.INDEX_NAME,
    s.NON_UNIQUE,
    GROUP_CONCAT(
      CASE
        WHEN s.SUB_PART IS NULL THEN s.COLUMN_NAME
        ELSE CONCAT(s.COLUMN_NAME, '(', s.SUB_PART, ')')
      END
      ORDER BY s.SEQ_IN_INDEX
      SEPARATOR ','
    ) AS firma_columnas
  FROM information_schema.STATISTICS s
  WHERE s.TABLE_SCHEMA = DATABASE()
    AND s.TABLE_NAME IN (
      'sup_notificaciones',
      'notificaciones_push_suscripciones',
      'usuario_zop',
      'ventas_prospecciones',
      'tickets'
    )
  GROUP BY s.TABLE_NAME, s.INDEX_NAME, s.NON_UNIQUE
)
SELECT
  a.TABLE_NAME,
  a.INDEX_NAME AS indice_a,
  b.INDEX_NAME AS indice_b,
  a.firma_columnas,
  a.NON_UNIQUE AS no_unico_a,
  b.NON_UNIQUE AS no_unico_b
FROM indices a
JOIN indices b
  ON b.TABLE_NAME = a.TABLE_NAME
 AND b.firma_columnas = a.firma_columnas
 AND b.INDEX_NAME > a.INDEX_NAME
ORDER BY a.TABLE_NAME, a.firma_columnas, a.INDEX_NAME;

-- Confirmacion puntual de las redundancias historicas conocidas en tickets.
SELECT
  s.INDEX_NAME,
  s.NON_UNIQUE,
  GROUP_CONCAT(s.COLUMN_NAME ORDER BY s.SEQ_IN_INDEX SEPARATOR ',') AS columnas
FROM information_schema.STATISTICS s
WHERE s.TABLE_SCHEMA = DATABASE()
  AND s.TABLE_NAME = 'tickets'
  AND s.INDEX_NAME IN ('uq_tickets_ticket', 'idx_ticket', 'idx_equipo', 'idx_codigo_equipo')
GROUP BY s.INDEX_NAME, s.NON_UNIQUE
ORDER BY s.INDEX_NAME;

-- Confirma la columna de cursor Push creada por FIX_PUSH_CURSOR_ID_V001.
SELECT
  c.TABLE_NAME,
  c.COLUMN_NAME,
  c.COLUMN_TYPE,
  c.IS_NULLABLE
FROM information_schema.COLUMNS c
WHERE c.TABLE_SCHEMA = DATABASE()
  AND c.TABLE_NAME = 'notificaciones_push_suscripciones'
  AND c.COLUMN_NAME = 'ultimo_id_notificacion';

-- Cobertura de los indices propuestos en Fase 5.
WITH firmas AS (
  SELECT
    s.TABLE_NAME,
    s.INDEX_NAME,
    GROUP_CONCAT(s.COLUMN_NAME ORDER BY s.SEQ_IN_INDEX SEPARATOR ',') AS columnas
  FROM information_schema.STATISTICS s
  WHERE s.TABLE_SCHEMA = DATABASE()
  GROUP BY s.TABLE_NAME, s.INDEX_NAME
)
SELECT 'sup_notificaciones' AS tabla,
       'id_usuario,activo,leido,id_notificacion' AS firma_objetivo,
       COUNT(*) AS indices_equivalentes
FROM firmas
WHERE TABLE_NAME = 'sup_notificaciones'
  AND columnas = 'id_usuario,activo,leido,id_notificacion'
UNION ALL
SELECT 'usuario_zop', 'usuario_id,estado,zona_id', COUNT(*)
FROM firmas
WHERE TABLE_NAME = 'usuario_zop'
  AND columnas = 'usuario_id,estado,zona_id'
UNION ALL
SELECT 'ventas_prospecciones', 'activo,fecha_visita,id_pros', COUNT(*)
FROM firmas
WHERE TABLE_NAME = 'ventas_prospecciones'
  AND columnas = 'activo,fecha_visita,id_pros'
UNION ALL
SELECT 'tickets', 'codigo_equipo,fecha_reporte', COUNT(*)
FROM firmas
WHERE TABLE_NAME = 'tickets'
  AND columnas = 'codigo_equipo,fecha_reporte';
