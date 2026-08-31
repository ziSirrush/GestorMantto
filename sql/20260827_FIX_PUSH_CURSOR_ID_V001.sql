-- [Aster | 2026-08-27 | ASTER-MG | FIX_PUSH_CURSOR_ID_V001]
-- Objetivo:
--   Reemplazar el cursor temporal como frontera de despacho Push por un cursor
--   monotono basado en sup_notificaciones.id_notificacion.
--
-- IMPORTANTE:
--   - No crea tablas nuevas.
--   - No modifica Evento/Rol, preferencias, alcance UNITED ni contenido de notificaciones.
--   - DDL en MySQL realiza COMMIT implicito; aplicar primero en Local/LAB.
--   - Ejecutar este SQL antes de desplegar el backend incluido en el fix.

-- 1) Agregar la columna de cursor solamente si todavia no existe.
SET @mg_schema = DATABASE();
SET @mg_has_cursor = (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @mg_schema
    AND TABLE_NAME = 'notificaciones_push_suscripciones'
    AND COLUMN_NAME = 'ultimo_id_notificacion'
);

SET @mg_sql = IF(
  @mg_has_cursor = 0,
  'ALTER TABLE notificaciones_push_suscripciones ADD COLUMN ultimo_id_notificacion INT UNSIGNED NULL AFTER ultimo_uso_at',
  'SELECT ''ultimo_id_notificacion ya existe'' AS info'
);

PREPARE mg_stmt FROM @mg_sql;
EXECUTE mg_stmt;
DEALLOCATE PREPARE mg_stmt;

-- 2) Migrar el estado existente sin volver a disparar historicos.
--    Para cada suscripcion se toma el ultimo id del mismo usuario cuya fecha ya
--    habia quedado atravesada por el cursor temporal anterior.
UPDATE notificaciones_push_suscripciones s
SET s.ultimo_id_notificacion = COALESCE((
  SELECT MAX(n.id_notificacion)
  FROM sup_notificaciones n
  WHERE n.id_usuario = s.id_usuario
    AND n.fecha_creacion <= COALESCE(s.ultimo_uso_at, s.created_at)
), 0)
WHERE s.ultimo_id_notificacion IS NULL;

-- 3) Verificaciones de integridad del nuevo cursor.
SELECT
  COUNT(*) AS suscripciones_total,
  SUM(CASE WHEN activo = 1 THEN 1 ELSE 0 END) AS suscripciones_activas,
  SUM(CASE WHEN ultimo_id_notificacion IS NULL THEN 1 ELSE 0 END) AS cursores_nulos
FROM notificaciones_push_suscripciones;

SELECT
  s.id_suscripcion,
  s.id_usuario,
  s.activo,
  s.ultimo_uso_at,
  s.ultimo_id_notificacion,
  COALESCE((
    SELECT MAX(n.id_notificacion)
    FROM sup_notificaciones n
    WHERE n.id_usuario = s.id_usuario
      AND n.fecha_creacion <= COALESCE(s.ultimo_uso_at, s.created_at)
  ), 0) AS cursor_legacy_equivalente,
  CASE
    WHEN s.ultimo_id_notificacion >= COALESCE((
      SELECT MAX(n.id_notificacion)
      FROM sup_notificaciones n
      WHERE n.id_usuario = s.id_usuario
        AND n.fecha_creacion <= COALESCE(s.ultimo_uso_at, s.created_at)
    ), 0) THEN 'OK'
    ELSE 'REVISAR'
  END AS validacion
FROM notificaciones_push_suscripciones s
ORDER BY s.id_suscripcion;
