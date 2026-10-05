-- [Aster | 2026-10-05 | ASTER-MG | PVO-PRODUCCION CAPTURA MANUAL FECHAS V001]
-- Objetivo:
--   1. Conservar una sola vez las fechas que antes se mostraban desde log_ops / ins_fl.
--   2. Convertir todos los registros existentes a captura MANUAL.
--   3. Retirar SEMI_AUTOMATICO del enum sin modificar log_ops ni ins_fl.
--
-- Las fechas de ins_fl solo se copian cuando todos los equipos activos del PPNS
-- tienen un unico valor distinto. Si existen varios valores, se conserva NULL
-- para que el usuario elija la fecha expresamente desde el calendario.

SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;

START TRANSACTION;

UPDATE logistica_produccion p
LEFT JOIN log_ops l
  ON l.id_log_ops=p.id_log_ops
LEFT JOIN (
  SELECT
    TRIM(i.id_proyecto) AS ppns,
    CASE
      WHEN COUNT(DISTINCT STR_TO_DATE(LEFT(TRIM(CAST(i.fecha_visita AS CHAR)),10),'%Y-%m-%d'))=1
      THEN MIN(STR_TO_DATE(LEFT(TRIM(CAST(i.fecha_visita AS CHAR)),10),'%Y-%m-%d'))
      ELSE NULL
    END AS fecha_visita_unica,
    CASE
      WHEN COUNT(DISTINCT STR_TO_DATE(LEFT(TRIM(CAST(i.fecha_posible_recepcion_cubo AS CHAR)),10),'%Y-%m-%d'))=1
      THEN MIN(STR_TO_DATE(LEFT(TRIM(CAST(i.fecha_posible_recepcion_cubo AS CHAR)),10),'%Y-%m-%d'))
      ELSE NULL
    END AS fecha_cubos_unica
  FROM ins_fl i
  WHERE i.activo=1
  GROUP BY TRIM(i.id_proyecto)
) fl
  ON fl.ppns=COALESCE(NULLIF(TRIM(p.ppns),''),NULLIF(TRIM(l.id_ppns),''))
SET
  p.ppns=COALESCE(NULLIF(TRIM(p.ppns),''),NULLIF(TRIM(l.id_ppns),'')),
  p.fecha_pvo=COALESCE(
    p.fecha_pvo,
    STR_TO_DATE(LEFT(TRIM(CAST(l.pvo AS CHAR)),10),'%Y-%m-%d')
  ),
  p.fecha_pvo_fl=COALESCE(p.fecha_pvo_fl,fl.fecha_visita_unica),
  p.fecha_cubos=COALESCE(p.fecha_cubos,fl.fecha_cubos_unica),
  p.modo_registro='MANUAL';

COMMIT;

ALTER TABLE logistica_produccion
  MODIFY COLUMN modo_registro ENUM('MANUAL')
  COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'MANUAL';

-- Verificacion posterior. Las fuentes se leen unicamente para comparar en Detalle.
SELECT
  modo_registro,
  COUNT(*) AS registros,
  SUM(fecha_pvo IS NULL) AS sin_fecha_pvo,
  SUM(fecha_pvo_fl IS NULL) AS sin_fecha_visita,
  SUM(fecha_cubos IS NULL) AS sin_fecha_cubos
FROM logistica_produccion
GROUP BY modo_registro;
