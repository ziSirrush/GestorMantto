-- [Aster | 2026-08-28 | ASTER-MG | FASE_5_SQL_AIVEN_OPTIMIZACION_V001]
-- DDL CONTROLADO. ESTE ARCHIVO SI MODIFICA INDICES.
-- NO fue ejecutado por Aster. Ejecutar solo despues de PRECHECK + EXPLAIN ANALYZE.
-- No crea tablas y no modifica datos funcionales.

SET @mg_schema = DATABASE();

-- -----------------------------------------------------------------------------
-- 1) Notificaciones: polling de estado cada 30 s + cursor Push por id.
-- -----------------------------------------------------------------------------
SET @mg_has_index = (
  SELECT COUNT(*)
  FROM (
    SELECT INDEX_NAME,
           GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX SEPARATOR ',') AS columnas
    FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = @mg_schema
      AND TABLE_NAME = 'sup_notificaciones'
    GROUP BY INDEX_NAME
  ) idx
  WHERE idx.columnas = 'id_usuario,activo,leido,id_notificacion'
);
SET @mg_sql = IF(
  @mg_has_index = 0,
  'ALTER TABLE sup_notificaciones ADD INDEX idx_sup_notif_poll (id_usuario, activo, leido, id_notificacion)',
  'SELECT ''Indice equivalente de sup_notificaciones ya existe'' AS info'
);
PREPARE mg_stmt FROM @mg_sql;
EXECUTE mg_stmt;
DEALLOCATE PREPARE mg_stmt;

-- -----------------------------------------------------------------------------
-- 2) Alcance UNITED: usuario -> estado activo -> zona.
-- -----------------------------------------------------------------------------
SET @mg_has_index = (
  SELECT COUNT(*)
  FROM (
    SELECT INDEX_NAME,
           GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX SEPARATOR ',') AS columnas
    FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = @mg_schema
      AND TABLE_NAME = 'usuario_zop'
    GROUP BY INDEX_NAME
  ) idx
  WHERE idx.columnas = 'usuario_id,estado,zona_id'
);
SET @mg_sql = IF(
  @mg_has_index = 0,
  'ALTER TABLE usuario_zop ADD INDEX idx_usuario_zop_scope (usuario_id, estado, zona_id)',
  'SELECT ''Indice equivalente de usuario_zop ya existe'' AS info'
);
PREPARE mg_stmt FROM @mg_sql;
EXECUTE mg_stmt;
DEALLOCATE PREPARE mg_stmt;

-- -----------------------------------------------------------------------------
-- 3) Prospeccion: listado activo + rango de fecha + paginacion estable.
-- -----------------------------------------------------------------------------
SET @mg_has_index = (
  SELECT COUNT(*)
  FROM (
    SELECT INDEX_NAME,
           GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX SEPARATOR ',') AS columnas
    FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = @mg_schema
      AND TABLE_NAME = 'ventas_prospecciones'
    GROUP BY INDEX_NAME
  ) idx
  WHERE idx.columnas = 'activo,fecha_visita,id_pros'
);
SET @mg_sql = IF(
  @mg_has_index = 0,
  'ALTER TABLE ventas_prospecciones ADD INDEX idx_vp_activo_fecha_id (activo, fecha_visita, id_pros)',
  'SELECT ''Indice equivalente de ventas_prospecciones ya existe'' AS info'
);
PREPARE mg_stmt FROM @mg_sql;
EXECUTE mg_stmt;
DEALLOCATE PREPARE mg_stmt;

-- -----------------------------------------------------------------------------
-- 4) Tickets: consultas generales por equipo + periodo.
--    No cambia codigo de Criticos/MTBC; solo ofrece un acceso compuesto comun.
-- -----------------------------------------------------------------------------
SET @mg_has_index = (
  SELECT COUNT(*)
  FROM (
    SELECT INDEX_NAME,
           GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX SEPARATOR ',') AS columnas
    FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = @mg_schema
      AND TABLE_NAME = 'tickets'
    GROUP BY INDEX_NAME
  ) idx
  WHERE idx.columnas = 'codigo_equipo,fecha_reporte'
);
SET @mg_sql = IF(
  @mg_has_index = 0,
  'ALTER TABLE tickets ADD INDEX idx_tickets_equipo_fecha (codigo_equipo, fecha_reporte)',
  'SELECT ''Indice equivalente de tickets(codigo_equipo,fecha_reporte) ya existe'' AS info'
);
PREPARE mg_stmt FROM @mg_sql;
EXECUTE mg_stmt;
DEALLOCATE PREPARE mg_stmt;

-- -----------------------------------------------------------------------------
-- 5) Limpieza: duplicado exacto codigo_equipo.
--    Solo elimina idx_equipo si idx_codigo_equipo existe con la misma firma.
-- -----------------------------------------------------------------------------
SET @mg_idx_equipo = (
  SELECT GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX SEPARATOR ',')
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = @mg_schema
    AND TABLE_NAME = 'tickets'
    AND INDEX_NAME = 'idx_equipo'
);
SET @mg_idx_codigo_equipo = (
  SELECT GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX SEPARATOR ',')
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = @mg_schema
    AND TABLE_NAME = 'tickets'
    AND INDEX_NAME = 'idx_codigo_equipo'
);
SET @mg_sql = IF(
  @mg_idx_equipo = 'codigo_equipo' AND @mg_idx_codigo_equipo = 'codigo_equipo',
  'ALTER TABLE tickets DROP INDEX idx_equipo',
  'SELECT ''idx_equipo no se elimina: no se confirmo duplicado exacto'' AS info'
);
PREPARE mg_stmt FROM @mg_sql;
EXECUTE mg_stmt;
DEALLOCATE PREPARE mg_stmt;

-- -----------------------------------------------------------------------------
-- 6) Limpieza: idx_ticket es redundante si uq_tickets_ticket(ticket) existe.
-- -----------------------------------------------------------------------------
SET @mg_idx_ticket = (
  SELECT GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX SEPARATOR ',')
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = @mg_schema
    AND TABLE_NAME = 'tickets'
    AND INDEX_NAME = 'idx_ticket'
);
SET @mg_uq_ticket = (
  SELECT GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX SEPARATOR ',')
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = @mg_schema
    AND TABLE_NAME = 'tickets'
    AND INDEX_NAME = 'uq_tickets_ticket'
    AND NON_UNIQUE = 0
);
SET @mg_sql = IF(
  @mg_idx_ticket = 'ticket' AND @mg_uq_ticket = 'ticket',
  'ALTER TABLE tickets DROP INDEX idx_ticket',
  'SELECT ''idx_ticket no se elimina: no se confirmo cobertura por uq_tickets_ticket'' AS info'
);
PREPARE mg_stmt FROM @mg_sql;
EXECUTE mg_stmt;
DEALLOCATE PREPARE mg_stmt;

ANALYZE TABLE sup_notificaciones, usuario_zop, ventas_prospecciones, tickets;

-- Postflight resumido.
SELECT
  s.TABLE_NAME,
  s.INDEX_NAME,
  s.NON_UNIQUE,
  GROUP_CONCAT(s.COLUMN_NAME ORDER BY s.SEQ_IN_INDEX SEPARATOR ',') AS columnas
FROM information_schema.STATISTICS s
WHERE s.TABLE_SCHEMA = DATABASE()
  AND s.TABLE_NAME IN ('sup_notificaciones', 'usuario_zop', 'ventas_prospecciones', 'tickets')
GROUP BY s.TABLE_NAME, s.INDEX_NAME, s.NON_UNIQUE
ORDER BY s.TABLE_NAME, s.INDEX_NAME;
