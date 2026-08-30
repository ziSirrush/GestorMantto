-- [Aster | 2026-08-30 | ASTER-MG | FASE 2 VENTAS DASHBOARD]
-- Objetivo:
--   Reutilizar ventas_redes_comentarios como bitacora de interacciones para
--   persistir los cambios de estatus de Redes sin crear una tabla nueva.
--
-- IMPORTANTE:
--   1) Este script NO borra datos existentes.
--   2) Los comentarios existentes quedan clasificados como COMENTARIO.
--   3) El trigger registra CAMBIO_ESTATUS dentro de la misma transaccion del UPDATE.
--   4) Ejecutar primero en desarrollo y validar antes de produccion.

SET @schema_name := DATABASE();

-- ---------------------------------------------------------------------------
-- Columnas de evento (idempotente mediante information_schema)
-- ---------------------------------------------------------------------------
SET @sql := (
  SELECT IF(
    EXISTS(
      SELECT 1 FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = @schema_name
        AND TABLE_NAME = 'ventas_redes_comentarios'
        AND COLUMN_NAME = 'tipo_evento'
    ),
    'SELECT 1',
    'ALTER TABLE ventas_redes_comentarios ADD COLUMN tipo_evento VARCHAR(40) NOT NULL DEFAULT ''COMENTARIO'' AFTER comentario'
  )
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := (
  SELECT IF(
    EXISTS(
      SELECT 1 FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = @schema_name
        AND TABLE_NAME = 'ventas_redes_comentarios'
        AND COLUMN_NAME = 'campo'
    ),
    'SELECT 1',
    'ALTER TABLE ventas_redes_comentarios ADD COLUMN campo VARCHAR(80) NULL AFTER tipo_evento'
  )
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := (
  SELECT IF(
    EXISTS(
      SELECT 1 FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = @schema_name
        AND TABLE_NAME = 'ventas_redes_comentarios'
        AND COLUMN_NAME = 'valor_anterior'
    ),
    'SELECT 1',
    'ALTER TABLE ventas_redes_comentarios ADD COLUMN valor_anterior VARCHAR(255) NULL AFTER campo'
  )
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := (
  SELECT IF(
    EXISTS(
      SELECT 1 FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = @schema_name
        AND TABLE_NAME = 'ventas_redes_comentarios'
        AND COLUMN_NAME = 'valor_nuevo'
    ),
    'SELECT 1',
    'ALTER TABLE ventas_redes_comentarios ADD COLUMN valor_nuevo VARCHAR(255) NULL AFTER valor_anterior'
  )
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Los registros historicos ya existentes son comentarios normales.
UPDATE ventas_redes_comentarios
   SET tipo_evento = 'COMENTARIO'
 WHERE tipo_evento IS NULL OR TRIM(tipo_evento) = '';

-- Indice auxiliar para recuperar la linea de tiempo por tipo de evento.
SET @sql := (
  SELECT IF(
    EXISTS(
      SELECT 1 FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = @schema_name
        AND TABLE_NAME = 'ventas_redes_comentarios'
        AND INDEX_NAME = 'idx_ventas_redes_evento_fecha'
    ),
    'SELECT 1',
    'CREATE INDEX idx_ventas_redes_evento_fecha ON ventas_redes_comentarios (id_redes, tipo_evento, fecha_hora)'
  )
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ---------------------------------------------------------------------------
-- Trigger de auditoria de estatus
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_ventas_redes_historial_estatus_au;
DELIMITER $$
CREATE TRIGGER trg_ventas_redes_historial_estatus_au
AFTER UPDATE ON ventas_redes
FOR EACH ROW
BEGIN
  DECLARE v_anterior VARCHAR(255) DEFAULT NULL;
  DECLARE v_nuevo VARCHAR(255) DEFAULT NULL;
  DECLARE v_actor BIGINT DEFAULT NULL;

  IF NOT (OLD.id_estatus <=> NEW.id_estatus) THEN
    IF OLD.id_estatus IS NOT NULL THEN
      SELECT articulo INTO v_anterior
        FROM catalogo_general
       WHERE id_catalogo = OLD.id_estatus
       LIMIT 1;
    END IF;

    IF NEW.id_estatus IS NOT NULL THEN
      SELECT articulo INTO v_nuevo
        FROM catalogo_general
       WHERE id_catalogo = NEW.id_estatus
       LIMIT 1;
    END IF;

    SET v_actor = NULLIF(NEW.updated_by, 0);

    INSERT INTO ventas_redes_comentarios (
      id_redes,
      id_usuario,
      comentario,
      tipo_evento,
      campo,
      valor_anterior,
      valor_nuevo,
      fecha_hora,
      editado,
      activo,
      created_at,
      updated_at
    ) VALUES (
      NEW.id_redes,
      v_actor,
      CONCAT(
        'Cambio de estatus: ',
        COALESCE(NULLIF(v_anterior, ''), 'Sin estatus'),
        ' -> ',
        COALESCE(NULLIF(v_nuevo, ''), 'Sin estatus')
      ),
      'CAMBIO_ESTATUS',
      'estatus',
      v_anterior,
      v_nuevo,
      COALESCE(NEW.fecha_cambio_estatus, CURRENT_TIMESTAMP(3)),
      0,
      1,
      CURRENT_TIMESTAMP(3),
      CURRENT_TIMESTAMP(3)
    );
  END IF;
END$$
DELIMITER ;

-- Los eventos de auditoria no deben editarse o desactivarse como si fueran
-- comentarios humanos. Los comentarios normales siguen funcionando igual.
DROP TRIGGER IF EXISTS trg_ventas_redes_evento_inmutable_bu;
DELIMITER $$
CREATE TRIGGER trg_ventas_redes_evento_inmutable_bu
BEFORE UPDATE ON ventas_redes_comentarios
FOR EACH ROW
BEGIN
  IF UPPER(COALESCE(OLD.tipo_evento, 'COMENTARIO')) <> 'COMENTARIO' THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Los eventos de historial de Redes son inmutables.';
  END IF;
END$$
DELIMITER ;

-- ---------------------------------------------------------------------------
-- Validaciones sugeridas (solo lectura)
-- ---------------------------------------------------------------------------
SELECT
  COLUMN_NAME,
  COLUMN_TYPE,
  IS_NULLABLE,
  COLUMN_DEFAULT
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'ventas_redes_comentarios'
  AND COLUMN_NAME IN ('tipo_evento', 'campo', 'valor_anterior', 'valor_nuevo')
ORDER BY ORDINAL_POSITION;

SELECT TRIGGER_NAME, EVENT_MANIPULATION, ACTION_TIMING
FROM information_schema.TRIGGERS
WHERE TRIGGER_SCHEMA = DATABASE()
  AND TRIGGER_NAME IN (
    'trg_ventas_redes_historial_estatus_au',
    'trg_ventas_redes_evento_inmutable_bu'
  );
