-- [Gestor Mantto | 2026-08-25 | FIX NOTIFICACIONES FASE 1]
-- Motor central: identidad logica/deduplicacion + trazabilidad.
--
-- REGLAS:
-- - No crea tablas nuevas.
-- - No crea ni modifica relaciones Evento-Rol.
-- - Las relaciones Evento-Rol siguen administrandose desde Panel de Control > Notificaciones.
-- - Es idempotente: puede ejecutarse nuevamente sin duplicar columnas/indices.
--
-- ORDEN DE DESPLIEGUE:
-- 1) Ejecutar este SQL.
-- 2) Desplegar los archivos JS de Fase 1.
-- 3) Reiniciar backend y ejecutar las validaciones descritas en FASE_1_NOTIFICACIONES.md.

SET @schema_name = DATABASE();

-- ---------------------------------------------------------------------------
-- 1. Clave persistente de deduplicacion por accion real.
--    NULL conserva compatibilidad con emisores legacy mientras se normalizan
--    en Fases 2 y 3. Los emisores nuevos/normalizados entregaran una clave de
--    instancia de accion; el motor la transforma a SHA-256 de 64 caracteres.
-- ---------------------------------------------------------------------------
SELECT COUNT(*) INTO @has_clave_deduplicacion
FROM information_schema.columns
WHERE table_schema = @schema_name
  AND table_name = 'sup_notificaciones'
  AND column_name = 'clave_deduplicacion';

SET @sql = IF(
  @has_clave_deduplicacion = 0,
  'ALTER TABLE sup_notificaciones ADD COLUMN clave_deduplicacion CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL AFTER ruta_destino',
  'SELECT ''clave_deduplicacion ya existe'' AS info'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ---------------------------------------------------------------------------
-- 2. Identificador de traza para diagnostico punta a punta.
-- ---------------------------------------------------------------------------
SELECT COUNT(*) INTO @has_trace_id
FROM information_schema.columns
WHERE table_schema = @schema_name
  AND table_name = 'sup_notificaciones'
  AND column_name = 'trace_id';

SET @sql = IF(
  @has_trace_id = 0,
  'ALTER TABLE sup_notificaciones ADD COLUMN trace_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL AFTER clave_deduplicacion',
  'SELECT ''trace_id ya existe'' AS info'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ---------------------------------------------------------------------------
-- 3. Unicidad logica.
--    MySQL permite multiples NULL en un indice UNIQUE. Por eso los emisores
--    legacy que aun no entreguen clave no quedan colapsados accidentalmente.
-- ---------------------------------------------------------------------------
SELECT COUNT(*) INTO @has_uq_sup_notif_evento_logico
FROM information_schema.statistics
WHERE table_schema = @schema_name
  AND table_name = 'sup_notificaciones'
  AND index_name = 'uq_sup_notif_evento_logico';

SET @sql = IF(
  @has_uq_sup_notif_evento_logico = 0,
  'ALTER TABLE sup_notificaciones ADD UNIQUE KEY uq_sup_notif_evento_logico (id_usuario, tipo_notificacion, clave_deduplicacion)',
  'SELECT ''uq_sup_notif_evento_logico ya existe'' AS info'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ---------------------------------------------------------------------------
-- 4. Indice de diagnostico por traza.
-- ---------------------------------------------------------------------------
SELECT COUNT(*) INTO @has_idx_sup_notif_trace
FROM information_schema.statistics
WHERE table_schema = @schema_name
  AND table_name = 'sup_notificaciones'
  AND index_name = 'idx_sup_notif_trace';

SET @sql = IF(
  @has_idx_sup_notif_trace = 0,
  'ALTER TABLE sup_notificaciones ADD KEY idx_sup_notif_trace (trace_id)',
  'SELECT ''idx_sup_notif_trace ya existe'' AS info'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ---------------------------------------------------------------------------
-- 5. VERIFICACION DE ESTRUCTURA.
-- ---------------------------------------------------------------------------
SELECT
  c.column_name,
  c.column_type,
  c.is_nullable,
  c.character_set_name,
  c.collation_name
FROM information_schema.columns c
WHERE c.table_schema = @schema_name
  AND c.table_name = 'sup_notificaciones'
  AND c.column_name IN ('clave_deduplicacion', 'trace_id')
ORDER BY c.ordinal_position;

SELECT
  s.index_name,
  s.non_unique,
  GROUP_CONCAT(s.column_name ORDER BY s.seq_in_index SEPARATOR ', ') AS columnas
FROM information_schema.statistics s
WHERE s.table_schema = @schema_name
  AND s.table_name = 'sup_notificaciones'
  AND s.index_name IN ('uq_sup_notif_evento_logico', 'idx_sup_notif_trace')
GROUP BY s.index_name, s.non_unique
ORDER BY s.index_name;

-- ---------------------------------------------------------------------------
-- 6. PREFLIGHT FUNCIONAL DE NORMA 2.
--    RESULTADO ESPERADO: 0 filas.
--    Si aparecen filas, NO se inventan roles ni se corrige automaticamente:
--    deben asignarse desde Panel de Control > Notificaciones antes de validar
--    integralmente la Fase 1.
-- ---------------------------------------------------------------------------
SELECT
  e.codigo_evento,
  e.nombre_evento,
  COUNT(r.id_rol) AS roles_activos_validos
FROM notificacion_eventos e
LEFT JOIN notificacion_evento_roles ner
  ON ner.codigo_evento = e.codigo_evento
 AND ner.activo = 1
 AND ner.politica IN ('OBLIGATORIA', 'OPCIONAL')
LEFT JOIN roles r
  ON r.id_rol = ner.id_rol
 AND r.estado = 1
WHERE e.activo = 1
GROUP BY e.codigo_evento, e.nombre_evento
HAVING COUNT(r.id_rol) = 0
ORDER BY e.codigo_evento;

-- ---------------------------------------------------------------------------
-- 7. DIAGNOSTICO DE RELACIONES HISTORICAS INACTIVAS.
--    Informativo: activo=0 se conserva como historico y NO cuenta como matriz.
-- ---------------------------------------------------------------------------
SELECT
  ner.codigo_evento,
  ner.id_rol,
  r.rol,
  ner.politica,
  ner.activo
FROM notificacion_evento_roles ner
LEFT JOIN roles r ON r.id_rol = ner.id_rol
WHERE ner.activo = 0
ORDER BY ner.codigo_evento, ner.id_rol;
