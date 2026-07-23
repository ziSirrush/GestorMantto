-- Mantto Gestor
-- FIX V028.4 - Soporte / Solicitudes
-- Alcance: completar la tabla existente sup_tickets para la bandeja administrativa.
-- Fuente oficial: Aiven MySQL.
-- Ejecutar una sola vez en la base correspondiente.

START TRANSACTION;

-- =========================================================
-- 1. Validar que exista la tabla oficial de solicitudes
-- =========================================================

SET @mg_existe_sup_tickets = (
    SELECT COUNT(*)
    FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'sup_tickets'
);

SET @mg_sql = IF(
    @mg_existe_sup_tickets = 1,
    'SELECT ''OK: tabla sup_tickets localizada'' AS resultado',
    'SIGNAL SQLSTATE ''45000'' SET MESSAGE_TEXT = ''No existe la tabla sup_tickets en la base activa'''
);

PREPARE mg_stmt FROM @mg_sql;
EXECUTE mg_stmt;
DEALLOCATE PREPARE mg_stmt;

-- =========================================================
-- 2. Fecha real del incidente
--    Para solicitudes nuevas conserva la hora de creación como valor
--    inicial cuando el usuario no proporciona una fecha distinta.
-- =========================================================

SET @mg_existe_fecha_incidente = (
    SELECT COUNT(*)
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'sup_tickets'
      AND COLUMN_NAME = 'fecha_incidente'
);

SET @mg_sql = IF(
    @mg_existe_fecha_incidente = 0,
    'ALTER TABLE sup_tickets ADD COLUMN fecha_incidente DATETIME NULL AFTER descripcion_ticket',
    'SELECT ''fecha_incidente ya existe'' AS resultado'
);

PREPARE mg_stmt FROM @mg_sql;
EXECUTE mg_stmt;
DEALLOCATE PREPARE mg_stmt;

-- =========================================================
-- 3. Fecha del último mensaje
--    Es independiente de fecha_actualizacion para no confundir una
--    edición administrativa con una interacción de conversación.
-- =========================================================

SET @mg_existe_fecha_ultimo_mensaje = (
    SELECT COUNT(*)
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'sup_tickets'
      AND COLUMN_NAME = 'fecha_ultimo_mensaje'
);

SET @mg_sql = IF(
    @mg_existe_fecha_ultimo_mensaje = 0,
    'ALTER TABLE sup_tickets ADD COLUMN fecha_ultimo_mensaje DATETIME NULL AFTER fecha_ultima_respuesta',
    'SELECT ''fecha_ultimo_mensaje ya existe'' AS resultado'
);

PREPARE mg_stmt FROM @mg_sql;
EXECUTE mg_stmt;
DEALLOCATE PREPARE mg_stmt;

-- =========================================================
-- 4. Inicializar registros históricos sin inventar información
-- =========================================================

UPDATE sup_tickets
SET fecha_incidente = fecha_creacion
WHERE fecha_incidente IS NULL;

UPDATE sup_tickets
SET fecha_ultimo_mensaje = COALESCE(
    fecha_ultima_respuesta,
    fecha_actualizacion,
    fecha_creacion
)
WHERE fecha_ultimo_mensaje IS NULL;

-- =========================================================
-- 5. Índices para filtros y ordenamiento de la bandeja
-- =========================================================

SET @mg_existe_idx_fecha_incidente = (
    SELECT COUNT(*)
    FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'sup_tickets'
      AND INDEX_NAME = 'idx_sup_ticket_fecha_incidente'
);

SET @mg_sql = IF(
    @mg_existe_idx_fecha_incidente = 0,
    'ALTER TABLE sup_tickets ADD INDEX idx_sup_ticket_fecha_incidente (fecha_incidente)',
    'SELECT ''idx_sup_ticket_fecha_incidente ya existe'' AS resultado'
);

PREPARE mg_stmt FROM @mg_sql;
EXECUTE mg_stmt;
DEALLOCATE PREPARE mg_stmt;

SET @mg_existe_idx_ultimo_mensaje = (
    SELECT COUNT(*)
    FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'sup_tickets'
      AND INDEX_NAME = 'idx_sup_ticket_ultimo_mensaje'
);

SET @mg_sql = IF(
    @mg_existe_idx_ultimo_mensaje = 0,
    'ALTER TABLE sup_tickets ADD INDEX idx_sup_ticket_ultimo_mensaje (fecha_ultimo_mensaje)',
    'SELECT ''idx_sup_ticket_ultimo_mensaje ya existe'' AS resultado'
);

PREPARE mg_stmt FROM @mg_sql;
EXECUTE mg_stmt;
DEALLOCATE PREPARE mg_stmt;

-- =========================================================
-- 6. Mantener fecha_ultimo_mensaje cuando cambia la respuesta
--    oficial del ticket. El futuro módulo Chats podrá actualizar
--    explícitamente esta misma columna al registrar cada mensaje.
-- =========================================================

DROP TRIGGER IF EXISTS trg_sup_tickets_bi_fechas;
DROP TRIGGER IF EXISTS trg_sup_tickets_bu_ultimo_mensaje;

DELIMITER $$

CREATE TRIGGER trg_sup_tickets_bi_fechas
BEFORE INSERT ON sup_tickets
FOR EACH ROW
BEGIN
    IF NEW.fecha_incidente IS NULL THEN
        SET NEW.fecha_incidente = COALESCE(NEW.fecha_creacion, CURRENT_TIMESTAMP);
    END IF;

    IF NEW.fecha_ultimo_mensaje IS NULL THEN
        SET NEW.fecha_ultimo_mensaje = COALESCE(
            NEW.fecha_ultima_respuesta,
            NEW.fecha_creacion,
            CURRENT_TIMESTAMP
        );
    END IF;
END$$

CREATE TRIGGER trg_sup_tickets_bu_ultimo_mensaje
BEFORE UPDATE ON sup_tickets
FOR EACH ROW
BEGIN
    IF NOT (NEW.fecha_ultima_respuesta <=> OLD.fecha_ultima_respuesta) THEN
        SET NEW.fecha_ultimo_mensaje = COALESCE(
            NEW.fecha_ultima_respuesta,
            CURRENT_TIMESTAMP
        );
    END IF;
END$$

DELIMITER ;

COMMIT;

-- =========================================================
-- 7. Verificación final
-- =========================================================

SELECT
    id_ticket,
    folio,
    asunto_ticket,
    modulo_ticket,
    estado_ticket,
    fecha_incidente,
    fecha_ultimo_mensaje
FROM sup_tickets
ORDER BY fecha_ultimo_mensaje DESC, id_ticket DESC
LIMIT 20;
