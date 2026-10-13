-- COBRANZA UNITED - Motor 2 - SOLO LECTURA - 2026-10-13
-- Ejecutar ANTES y DESPUES de desplegar el validador; no modifica datos.

-- 1) Confirmar que el puente tiene el tipo esperado (V003).
SELECT TABLE_NAME, COLUMN_NAME, COLUMN_TYPE
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'proyectos_mantto'
  AND COLUMN_NAME = 'cobranza';

-- 2) Catalogo con IDs que no resuelven o con nombres distintos.
SELECT pm.id, pm.proyecto AS proyecto_mantto,
       pm.cobranza AS id_cobranza, cp.proyecto AS proyecto_cobranza
FROM proyectos_mantto AS pm
LEFT JOIN cobranza_proyectos AS cp
  ON cp.id_proyecto_cobranza = pm.cobranza
WHERE pm.cobranza IS NOT NULL
  AND (cp.id_proyecto_cobranza IS NULL OR
       pm.proyecto COLLATE utf8mb4_0900_bin
         <> cp.proyecto COLLATE utf8mb4_0900_bin);

-- 3) Duplicados que el motor EXCLUYE deliberadamente.
SELECT cobranza, COUNT(*) AS relaciones
FROM proyectos_mantto WHERE cobranza IS NOT NULL
GROUP BY cobranza HAVING COUNT(*) > 1;

SELECT TRIM(proyecto) COLLATE utf8mb4_0900_as_ci AS nombre,
       COUNT(*) AS variantes
FROM proyectos_mantto
GROUP BY TRIM(proyecto) COLLATE utf8mb4_0900_as_ci
HAVING COUNT(*) > 1;

-- 4) Diagnostico completo por modulo y proyecto.
WITH
fuentes AS (
  SELECT 'GC' AS modulo, id_gc AS id_registro, proyecto, id_proyecto_cobranza FROM gestion_credito
  UNION ALL
  SELECT 'MP', id_dmp, proyecto, id_proyecto_cobranza FROM detalle_mp_2026
  UNION ALL
  SELECT 'VA', id_pc, proyecto, id_proyecto_cobranza FROM pc
),
nombres_unicos AS (
  SELECT TRIM(proyecto) COLLATE utf8mb4_0900_as_ci AS clave
  FROM proyectos_mantto
  GROUP BY TRIM(proyecto) COLLATE utf8mb4_0900_as_ci
  HAVING COUNT(*) = 1
),
ids_unicos AS (
  SELECT cobranza FROM proyectos_mantto WHERE cobranza IS NOT NULL
  GROUP BY cobranza HAVING COUNT(*) = 1
),
mapa AS (
  SELECT pm.cobranza, TRIM(pm.proyecto) COLLATE utf8mb4_0900_as_ci AS clave
  FROM proyectos_mantto pm
  JOIN cobranza_proyectos cp
    ON cp.id_proyecto_cobranza = pm.cobranza
   AND pm.proyecto COLLATE utf8mb4_0900_bin
     = cp.proyecto COLLATE utf8mb4_0900_bin
  JOIN nombres_unicos nu
    ON nu.clave = TRIM(pm.proyecto) COLLATE utf8mb4_0900_as_ci
  JOIN ids_unicos iu ON iu.cobranza = pm.cobranza
)
SELECT f.modulo,
       COUNT(*) AS registros,
       SUM(f.id_proyecto_cobranza = m.cobranza) AS alineados,
       SUM(m.cobranza IS NOT NULL AND f.id_proyecto_cobranza IS NULL) AS id_ausente_corregible,
       SUM(m.cobranza IS NOT NULL AND f.id_proyecto_cobranza IS NOT NULL
           AND f.id_proyecto_cobranza <> m.cobranza) AS id_erroneo_corregible,
       SUM(m.cobranza IS NULL) AS sin_mapa_seguro
FROM fuentes f
LEFT JOIN mapa m
  ON TRIM(f.proyecto) COLLATE utf8mb4_0900_as_ci = m.clave
GROUP BY f.modulo
ORDER BY FIELD(f.modulo, 'GC', 'MP', 'VA');
