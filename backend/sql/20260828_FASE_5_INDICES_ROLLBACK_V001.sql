-- [Aster | 2026-08-28 | ASTER-MG | FASE_5_SQL_AIVEN_OPTIMIZACION_V001]
-- ROLLBACK DE INDICES DE FASE 5.
-- Usar solamente si se aplico 20260828_FASE_5_INDICES_APLICAR_V001.sql y se requiere revertir.

SET @mg_schema = DATABASE();

SET @mg_exists = (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA=@mg_schema AND TABLE_NAME='sup_notificaciones' AND INDEX_NAME='idx_sup_notif_poll'
);
SET @mg_sql = IF(@mg_exists > 0,
  'ALTER TABLE sup_notificaciones DROP INDEX idx_sup_notif_poll',
  'SELECT ''idx_sup_notif_poll no existe'' AS info');
PREPARE mg_stmt FROM @mg_sql; EXECUTE mg_stmt; DEALLOCATE PREPARE mg_stmt;

SET @mg_exists = (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA=@mg_schema AND TABLE_NAME='usuario_zop' AND INDEX_NAME='idx_usuario_zop_scope'
);
SET @mg_sql = IF(@mg_exists > 0,
  'ALTER TABLE usuario_zop DROP INDEX idx_usuario_zop_scope',
  'SELECT ''idx_usuario_zop_scope no existe'' AS info');
PREPARE mg_stmt FROM @mg_sql; EXECUTE mg_stmt; DEALLOCATE PREPARE mg_stmt;

SET @mg_exists = (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA=@mg_schema AND TABLE_NAME='ventas_prospecciones' AND INDEX_NAME='idx_vp_activo_fecha_id'
);
SET @mg_sql = IF(@mg_exists > 0,
  'ALTER TABLE ventas_prospecciones DROP INDEX idx_vp_activo_fecha_id',
  'SELECT ''idx_vp_activo_fecha_id no existe'' AS info');
PREPARE mg_stmt FROM @mg_sql; EXECUTE mg_stmt; DEALLOCATE PREPARE mg_stmt;

SET @mg_exists = (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA=@mg_schema AND TABLE_NAME='tickets' AND INDEX_NAME='idx_tickets_equipo_fecha'
);
SET @mg_sql = IF(@mg_exists > 0,
  'ALTER TABLE tickets DROP INDEX idx_tickets_equipo_fecha',
  'SELECT ''idx_tickets_equipo_fecha no existe'' AS info');
PREPARE mg_stmt FROM @mg_sql; EXECUTE mg_stmt; DEALLOCATE PREPARE mg_stmt;

-- Restaura los dos indices redundantes que Fase 5 puede haber retirado.
SET @mg_exists = (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA=@mg_schema AND TABLE_NAME='tickets' AND INDEX_NAME='idx_equipo'
);
SET @mg_sql = IF(@mg_exists = 0,
  'ALTER TABLE tickets ADD INDEX idx_equipo (codigo_equipo)',
  'SELECT ''idx_equipo ya existe'' AS info');
PREPARE mg_stmt FROM @mg_sql; EXECUTE mg_stmt; DEALLOCATE PREPARE mg_stmt;

SET @mg_exists = (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA=@mg_schema AND TABLE_NAME='tickets' AND INDEX_NAME='idx_ticket'
);
SET @mg_sql = IF(@mg_exists = 0,
  'ALTER TABLE tickets ADD INDEX idx_ticket (ticket)',
  'SELECT ''idx_ticket ya existe'' AS info');
PREPARE mg_stmt FROM @mg_sql; EXECUTE mg_stmt; DEALLOCATE PREPARE mg_stmt;

ANALYZE TABLE sup_notificaciones, usuario_zop, ventas_prospecciones, tickets;
