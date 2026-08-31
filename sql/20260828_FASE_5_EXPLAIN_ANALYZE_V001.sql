-- [Aster | 2026-08-28 | ASTER-MG | FASE_5_SQL_AIVEN_OPTIMIZACION_V001]
-- SOLO LECTURA, pero EXPLAIN ANALYZE EJECUTA los SELECT para medirlos.
-- Ejecutar en LAB/Aiven en una ventana controlada y guardar el resultado ANTES y DESPUES del DDL.
-- No incluye consultas de Criticos/MTBC asignadas a Lumbre.

SET @mg_user_id = (
  SELECT MIN(id_SB)
  FROM usuarios
  WHERE estado = 1
);
SET @mg_year = YEAR(CURRENT_DATE());
SET @mg_year_start = STR_TO_DATE(CONCAT(@mg_year, '-01-01 00:00:00'), '%Y-%m-%d %H:%i:%s');
SET @mg_next_year_start = STR_TO_DATE(CONCAT(@mg_year + 1, '-01-01 00:00:00'), '%Y-%m-%d %H:%i:%s');
SET @mg_equipo = (
  SELECT codigo_equipo
  FROM tickets
  WHERE codigo_equipo IS NOT NULL
    AND codigo_equipo <> ''
  ORDER BY id DESC
  LIMIT 1
);

SELECT '01_NOTIFICACIONES_ESTADO_30S' AS prueba;
EXPLAIN ANALYZE
SELECT
  COUNT(*) AS nuevas,
  COALESCE(MAX(n.id_notificacion), 0) AS ultimo_id
FROM sup_notificaciones n
WHERE n.id_usuario = @mg_user_id
  AND n.activo = 1
  AND n.leido = 0;

SELECT '02_NOTIFICACIONES_CURSOR_PUSH' AS prueba;
EXPLAIN ANALYZE
SELECT
  n.id_notificacion,
  n.tipo_notificacion,
  n.fecha_creacion
FROM sup_notificaciones n
WHERE n.id_usuario = @mg_user_id
  AND n.activo = 1
  AND n.leido = 0
  AND n.id_notificacion > 0
  AND n.id_notificacion <= 4294967295
ORDER BY n.id_notificacion ASC
LIMIT 20;

SELECT '03_USUARIO_ZOP_ALCANCE' AS prueba;
EXPLAIN ANALYZE
SELECT
  uz.zona_id
FROM usuario_zop uz
WHERE uz.usuario_id = @mg_user_id
  AND uz.estado = 1
ORDER BY uz.zona_id ASC;

SELECT '04_PROSPECCION_FILTRO_ANTERIOR_NO_SARGABLE' AS prueba;
EXPLAIN ANALYZE
SELECT p.id_pros, p.fecha_visita
FROM ventas_prospecciones p
WHERE p.activo = 1
  AND YEAR(p.fecha_visita) = @mg_year
ORDER BY p.fecha_visita DESC, p.id_pros DESC
LIMIT 50;

SELECT '05_PROSPECCION_FILTRO_FASE5_SARGABLE' AS prueba;
EXPLAIN ANALYZE
SELECT p.id_pros, p.fecha_visita
FROM ventas_prospecciones p
WHERE p.activo = 1
  AND p.fecha_visita >= @mg_year_start
  AND p.fecha_visita < @mg_next_year_start
ORDER BY p.fecha_visita DESC, p.id_pros DESC
LIMIT 50;

SELECT '06_PROSPECCION_USUARIO_Y_ANIO' AS prueba;
EXPLAIN ANALYZE
SELECT p.id_pros, p.fecha_visita
FROM ventas_prospecciones p
WHERE p.activo = 1
  AND p.id_usuario = @mg_user_id
  AND p.fecha_visita >= @mg_year_start
  AND p.fecha_visita < @mg_next_year_start
ORDER BY p.fecha_visita DESC, p.id_pros DESC
LIMIT 50;

SELECT '07_TICKETS_EQUIPO_FECHA' AS prueba;
EXPLAIN ANALYZE
SELECT t.id, t.ticket, t.fecha_reporte
FROM tickets t
WHERE t.codigo_equipo = @mg_equipo
  AND t.fecha_reporte >= DATE_SUB(CURRENT_DATE(), INTERVAL 365 DAY)
ORDER BY t.fecha_reporte DESC, t.id DESC
LIMIT 50;
